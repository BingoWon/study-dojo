/**
 * Chat endpoint handler — uses graph.stream() with streamMode: "messages"
 * for real-time token-level streaming to the frontend.
 */

import { HumanMessage } from "@langchain/core/messages";
import { eq } from "drizzle-orm";
import { convertToWireFormat, createAgent, generateTitle } from "./agent";
import { getUserId } from "./auth";
import { D1Saver } from "./checkpointer";
import { createDb, ensureThread, touchThread, updateThreadTitle } from "./db";
import { log } from "./log";
import { userPapers } from "./schema";

export async function handleChatRequest(
	// biome-ignore lint/suspicious/noExplicitAny: Hono context
	c: any,
): Promise<Response> {
	try {
		const body = await c.req.json();
		const threadId = body.threadId as string;
		if (!threadId) return c.json({ error: "缺少 threadId" }, 400);

		const userId = await getUserId(c, c.env);
		if (!userId) return c.json({ error: "未授权" }, 401);
		if (!c.env.API_KEY || !c.env.MODEL)
			return c.json({ error: "缺少配置" }, 500);

		const db = createDb(c.env.DB);
		const checkpointer = new D1Saver(c.env.DB);
		await ensureThread(db, threadId, userId);

		let paperIds: string[] = [];
		try {
			if (c.env.VECTORIZE && c.env.EMBEDDING_BASE_URL) {
				const links = await db
					.select({ paperId: userPapers.paperId })
					.from(userPapers)
					.where(eq(userPapers.userId, userId));
				paperIds = links.map((l) => l.paperId);
			}
		} catch {
			/* vectorize unavailable in local dev */
		}

		const graph = createAgent({ env: c.env, db, paperIds, checkpointer });
		const config = { configurable: { thread_id: threadId } };

		// Build graph input
		// biome-ignore lint/suspicious/noExplicitAny: LangGraph input varies
		let graphInput: any;
		if (body.resume !== undefined) {
			const { Command } = await import("@langchain/langgraph");
			graphInput = new Command({ resume: body.resume });
		} else if (body.message) {
			graphInput = { messages: [new HumanMessage(body.message)] };
		} else {
			return c.json({ error: "缺少 message 或 resume" }, 400);
		}

		// Title detection
		const existing = await checkpointer.getTuple(config);
		const hasMsgs =
			existing?.checkpoint.channel_values?.messages &&
			Array.isArray(existing.checkpoint.channel_values.messages) &&
			existing.checkpoint.channel_values.messages.length > 0;
		const titlePromise =
			!body.resume && !hasMsgs
				? generateTitle((body.message ?? "").slice(0, 200), c.env).catch(
						() => "",
					)
				: null;

		// SSE streaming via TransformStream
		const enc = new TextEncoder();
		const { readable, writable } = new TransformStream();
		const writer = writable.getWriter();

		const send = async (ev: string, d: unknown) =>
			writer.write(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`));

		// Stream in background — return response immediately
		const streamTask = (async () => {
			try {
				// Stream the graph with message-level chunks
				const msgStream = await graph.stream(graphInput, {
					...config,
					streamMode: "messages",
				});

				for await (const ev of msgStream) {
					// biome-ignore lint/suspicious/noExplicitAny: LangGraph stream event
					const chunk = (Array.isArray(ev) ? ev[0] : ev) as any;
					if (!chunk) continue;

					// Text content delta
					if (typeof chunk.content === "string" && chunk.content) {
						await send("delta", { content: chunk.content });
					}

					// Tool call argument chunks (streaming)
					if (Array.isArray(chunk.tool_call_chunks)) {
						for (const tc of chunk.tool_call_chunks) {
							await send("tool-call-chunk", {
								id: tc.id,
								name: tc.name,
								args: tc.args,
							});
						}
					}

					// Complete tool calls
					if (Array.isArray(chunk.tool_calls) && chunk.tool_calls.length > 0) {
						for (const tc of chunk.tool_calls) {
							await send("tool-call", {
								id: tc.id,
								name: tc.name,
								args: tc.args,
							});
							if (tc.name === "update_recipe") {
								await send("recipe-update", tc.args);
							}
						}
					}
				}

				// Check interrupts
				const state = await graph.getState(config);
				// biome-ignore lint/suspicious/noExplicitAny: task shape
				const interruptTask = (state.tasks ?? []).find(
					(t: any) => t.interrupts?.length,
				);

				if (interruptTask) {
					// biome-ignore lint/suspicious/noExplicitAny: interrupt value
					await send("interrupt", {
						value: (interruptTask as any).interrupts[0].value,
					});
				} else {
					const allMsgs = state.values?.messages;
					if (Array.isArray(allMsgs))
						await send("messages", convertToWireFormat(allMsgs));
					await send("done", {});
				}

				// Title
				if (titlePromise) {
					const title = await titlePromise;
					if (title) {
						await send("title", { title });
						await updateThreadTitle(db, threadId, userId, title);
					}
				}

				await touchThread(db, threadId, userId);
			} catch (e) {
				const msg = e instanceof Error ? e.message : "未知错误";
				log.error({ module: "chat", msg, error: String(e) });
				await send("error", { message: msg });
			} finally {
				await writer.close();
			}
		})();

		// waitUntil ensures the stream completes even if the client disconnects
		c.executionCtx?.waitUntil?.(streamTask);

		return new Response(readable, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "未知错误";
		log.error({ module: "chat", msg, error: String(e) });
		return Response.json({ error: msg }, { status: 500 });
	}
}

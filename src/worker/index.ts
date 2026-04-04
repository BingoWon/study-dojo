import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { convertToWireFormat, createAgent, generateTitle } from "./agent";
import { getUserId } from "./auth";
import { D1Saver } from "./checkpointer";
import {
	createDb,
	deleteThread,
	ensureThread,
	getThread,
	getThreadsByUserId,
	touchThread,
	updateThreadTitle,
} from "./db";
import { log } from "./log";
import {
	checkPaperByHash,
	classifyFile,
	getPaperMarkdown,
	ingestFile,
	listUserPapers,
	renameUserPaper,
	unlinkUserPaper,
} from "./rag";
import { papers, userPapers } from "./schema";

const app = new Hono<{ Bindings: Env }>();

// ── Auth helper ─────────────────────────────────────────────────────────────

async function requireUserId(c: {
	req: { header: (name: string) => string | undefined };
	env: Env;
}) {
	return getUserId(c, c.env);
}

// ── Thread CRUD ──────────────────────────────────────────────────────────────

app.get("/api/threads", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	return c.json(await getThreadsByUserId(db, userId));
});

app.patch("/api/threads/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const { title } = await c.req.json<{ title: string }>();
	const db = createDb(c.env.DB);
	await updateThreadTitle(db, c.req.param("id"), userId, title);
	return c.json({ ok: true });
});

app.delete("/api/threads/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const threadId = c.req.param("id");
	await deleteThread(db, threadId, userId);
	// Also clean up checkpoints
	const saver = new D1Saver(c.env.DB);
	await saver.deleteThread(threadId).catch(() => {});
	return c.json({ ok: true });
});

app.get("/api/threads/:id/messages", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const threadId = c.req.param("id");

	const thread = await getThread(db, threadId);
	if (!thread || thread.userId !== userId) return c.json({ messages: [] }, 200);

	// Load messages from LangGraph checkpoint
	try {
		const saver = new D1Saver(c.env.DB);
		const tuple = await saver.getTuple({
			configurable: { thread_id: threadId },
		});

		if (!tuple) return c.json({ messages: [] }, 200);

		const rawMsgs = tuple.checkpoint.channel_values?.messages;
		const messages = Array.isArray(rawMsgs) ? convertToWireFormat(rawMsgs) : [];

		// Check for pending interrupts
		const pendingWrites = tuple.pendingWrites ?? [];
		const interruptWrite = pendingWrites.find(
			([, channel]) => channel === "__interrupt__",
		);
		const interruptValue = interruptWrite
			? // biome-ignore lint/suspicious/noExplicitAny: interrupt value shape varies
				(interruptWrite[2] as any)?.[0]?.value
			: undefined;

		return c.json({ messages, interrupt: interruptValue ?? null });
	} catch (e) {
		log.error({
			module: "messages",
			msg: "failed to load checkpoint",
			error: String(e),
		});
		return c.json({ messages: [] }, 200);
	}
});

// ── Papers ───────────────────────────────────────────────────────────────────

app.get("/api/papers", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	return c.json(await listUserPapers(db, userId));
});

app.get("/api/papers/check", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const hash = c.req.query("hash");
	if (!hash) return c.json({ error: "缺少 hash 参数" }, 400);

	const db = createDb(c.env.DB);
	const result = await checkPaperByHash(db, hash);
	if (!result.exists) return c.json({ exists: false });

	const now = Math.floor(Date.now() / 1000);
	await db
		.insert(userPapers)
		.values({ userId, paperId: result.paperId, createdAt: now })
		.onConflictDoNothing();

	return c.json(result);
});

app.post("/api/papers", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const formData = await c.req.formData();
	const file = formData.get("file") as File | null;
	if (!file) return c.json({ error: "缺少文件" }, 400);

	const classified = classifyFile(file.name);
	if (classified.category === "ocr" && !c.env.PADDLE_OCR_TOKEN)
		return c.json({ error: "缺少 PADDLE_OCR_TOKEN 配置" }, 500);
	const db = createDb(c.env.DB);
	const buffer = await file.arrayBuffer();
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: string, data: Record<string, unknown>) => {
				controller.enqueue(
					encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
				);
			};

			let ingestPaperId: string | undefined;
			try {
				const fileExt = file.name.split(".").pop()?.toLowerCase();
				await ingestFile(buffer, {
					fileName: file.name.replace(/\.[^.]+$/, ""),
					fileExt,
					category: classified.category,
					ocrType: classified.ocrType,
					userId,
					db,
					r2: c.env.R2,
					vectorize: c.env.VECTORIZE,
					env: c.env,
					onStatus: (status, data) => {
						if (data?.paperId) ingestPaperId = data.paperId as string;
						send("status", { status, ...data });
					},
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : "处理失败";
				log.error({ module: "ingest", msg, paperId: ingestPaperId });
				if (ingestPaperId) {
					await db
						.update(papers)
						.set({ status: "failed" })
						.where(eq(papers.id, ingestPaperId))
						.catch(() => {});
				}
				send("status", { status: "failed", error: msg });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
});

app.patch("/api/papers/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const { title } = await c.req.json<{ title: string }>();
	const db = createDb(c.env.DB);
	await renameUserPaper(db, userId, c.req.param("id"), title);
	return c.json({ ok: true });
});

app.delete("/api/papers/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	await unlinkUserPaper(db, userId, c.req.param("id"));
	return c.json({ ok: true });
});

app.get("/api/papers/:id/download", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const db = createDb(c.env.DB);
	const paperId = c.req.param("id");

	const [row] = await db
		.select({ r2Key: papers.r2Key, title: userPapers.title })
		.from(userPapers)
		.innerJoin(papers, eq(papers.id, userPapers.paperId))
		.where(and(eq(userPapers.userId, userId), eq(userPapers.paperId, paperId)))
		.limit(1);
	if (!row) return c.json({ error: "未找到" }, 404);

	const obj = await c.env.R2.get(row.r2Key);
	if (!obj) return c.json({ error: "文件不存在" }, 404);

	const isImage = !row.r2Key.endsWith(".pdf");
	const contentType = isImage ? "application/octet-stream" : "application/pdf";
	const ext = row.r2Key.split(".").pop() ?? "pdf";
	const filename = encodeURIComponent(row.title);
	return new Response(obj.body, {
		headers: {
			"Content-Type": contentType,
			"Content-Disposition": `attachment; filename="${filename}.${ext}"; filename*=UTF-8''${filename}.${ext}`,
		},
	});
});

app.get("/api/papers/:id/markdown", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const lang = (c.req.query("lang") as "original" | "zh") || "original";
	const db = createDb(c.env.DB);
	const md = await getPaperMarkdown(c.req.param("id"), {
		db,
		r2: c.env.R2,
		userId,
		lang,
	});
	if (md === null) return c.json({ error: "未找到" }, 404);
	return c.text(md);
});

app.post("/api/papers/:id/generate-title", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const db = createDb(c.env.DB);
	const paperId = c.req.param("id");
	const { fileName, fileExt } = await c.req
		.json<{ fileName?: string; fileExt?: string }>()
		.catch(() => ({ fileName: undefined, fileExt: undefined }));

	const md = await getPaperMarkdown(paperId, { db, r2: c.env.R2, userId });
	if (!md) return c.json({ error: "未找到" }, 404);

	const fullName = fileName
		? fileExt
			? `${fileName}.${fileExt}`
			: fileName
		: null;
	const hintStr = fullName ? `\n文件名：${fullName}` : "";

	const title = await generateTitle(`${md.slice(0, 500)}${hintStr}`, c.env);

	if (title) {
		await renameUserPaper(db, userId, paperId, title);
	}

	return c.json({ title });
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ status: "ok" }));

// ── Chat (LangGraph streaming) ──────────────────────────────────────────────

app.post("/api/chat", async (c) => {
	try {
		const body = await c.req.json<{
			threadId: string;
			message?: string;
			attachments?: Array<{ type: string; data: string; mimeType?: string }>;
			resume?: unknown;
		}>();

		const { threadId } = body;
		const userId = await requireUserId(c);
		if (!userId) return c.json({ error: "未授权" }, 401);
		if (!c.env.API_KEY) return c.json({ error: "缺少 API_KEY 配置" }, 500);
		if (!c.env.MODEL) return c.json({ error: "缺少 MODEL 配置" }, 500);

		const db = createDb(c.env.DB);
		const checkpointer = new D1Saver(c.env.DB);

		// Ensure thread exists
		await ensureThread(db, threadId, userId);

		// Get user's papers for RAG
		let paperIds: string[] = [];
		if (c.env.VECTORIZE && c.env.EMBEDDING_BASE_URL) {
			try {
				const links = await db
					.select({ paperId: userPapers.paperId })
					.from(userPapers)
					.where(eq(userPapers.userId, userId));
				paperIds = links.map((l) => l.paperId);
			} catch {
				// Vectorize only works remotely; skip in local dev
			}
		}

		const graph = createAgent({
			env: c.env,
			db,
			paperIds,
			checkpointer,
		});

		const config = { configurable: { thread_id: threadId } };

		// Determine if this is a first message (for title generation)
		const existingTuple = await checkpointer.getTuple(config);
		const existingMsgs = existingTuple?.checkpoint.channel_values?.messages;
		const isFirstMessage =
			!body.resume &&
			(!existingMsgs ||
				!Array.isArray(existingMsgs) ||
				existingMsgs.length === 0);
		const firstUserText = isFirstMessage
			? (body.message ?? "").slice(0, 200)
			: "";

		// Build input
		// biome-ignore lint/suspicious/noExplicitAny: LangGraph input varies
		let graphInput: any;

		if (body.resume !== undefined) {
			// Resume after interrupt
			graphInput = new Command({ resume: body.resume });
		} else if (body.message) {
			// New message
			// biome-ignore lint/suspicious/noExplicitAny: multimodal content parts
			const contentParts: any[] = [{ type: "text", text: body.message }];
			if (body.attachments) {
				for (const att of body.attachments) {
					if (att.type === "image") {
						contentParts.push({
							type: "image_url",
							image_url: { url: att.data },
						});
					}
				}
			}
			const humanMsg =
				contentParts.length === 1
					? new HumanMessage(body.message)
					: new HumanMessage({ content: contentParts });

			graphInput = { messages: [humanMsg] };
		} else {
			return c.json({ error: "缺少 message 或 resume 参数" }, 400);
		}

		// Fire concurrent title generation
		let titlePromise: Promise<string> | null = null;
		if (firstUserText) {
			titlePromise = generateTitle(firstUserText, c.env).catch(() => "");
		}

		// SSE streaming
		const encoder = new TextEncoder();

		const stream = new ReadableStream({
			async start(controller) {
				const send = (event: string, data: unknown) => {
					controller.enqueue(
						encoder.encode(
							`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
						),
					);
				};

				try {
					const msgStream = await graph.stream(graphInput, {
						...config,
						streamMode: "messages",
					});

					for await (const event of msgStream) {
						// streamMode: "messages" yields [chunk, metadata]
						// biome-ignore lint/suspicious/noExplicitAny: LangGraph stream event
						const chunk = (Array.isArray(event) ? event[0] : event) as any;
						if (!chunk) continue;

						// Text content streaming
						if (typeof chunk.content === "string" && chunk.content) {
							send("delta", { content: chunk.content });
						}

						// Tool call chunks (streaming tool call args)
						if (Array.isArray(chunk.tool_call_chunks)) {
							for (const tc of chunk.tool_call_chunks) {
								if (tc.id && tc.name) {
									send("tool-call-start", {
										id: tc.id,
										name: tc.name,
									});
								}
							}
						}

						// Complete tool calls (from full AIMessage, not chunks)
						if (
							Array.isArray(chunk.tool_calls) &&
							chunk.tool_calls.length > 0
						) {
							for (const tc of chunk.tool_calls) {
								send("tool-call", {
									id: tc.id,
									name: tc.name,
									args: tc.args,
								});
								// Real-time recipe update
								if (tc.name === "update_recipe") {
									send("recipe-update", tc.args);
								}
							}
						}
					}

					// Check for interrupts
					const state = await graph.getState(config);
					const tasks = state.tasks ?? [];
					// biome-ignore lint/suspicious/noExplicitAny: task type from LangGraph
					const interruptTask = tasks.find((t: any) => t.interrupts?.length);

					if (interruptTask) {
						send("interrupt", {
							// biome-ignore lint/suspicious/noExplicitAny: interrupt value varies
							value: (interruptTask as any).interrupts[0].value,
						});
					} else {
						// Send final message list
						const finalMsgs = state.values?.messages;
						if (Array.isArray(finalMsgs)) {
							send("messages", convertToWireFormat(finalMsgs));
						}
						send("done", {});
					}

					// Title generation
					if (titlePromise) {
						const title = await titlePromise;
						if (title) {
							send("title", { title });
							await updateThreadTitle(db, threadId, userId, title);
						}
					}

					await touchThread(db, threadId, userId);
				} catch (e) {
					const msg = e instanceof Error ? e.message : "未知错误";
					log.error({ module: "chat", msg, error: String(e) });
					send("error", { message: msg });
				} finally {
					controller.close();
				}
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : "未知错误";
		log.error({ module: "chat", msg });
		return c.json({ error: msg }, 500);
	}
});

export default app;

import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	stepCountIs,
	streamText,
} from "ai";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getUserId } from "./auth";
import {
	createDb,
	deleteThread,
	ensureThread,
	getMessagesByThreadId,
	getThread,
	getThreadsByUserId,
	saveMessages,
	touchThread,
	updateThreadTitle,
} from "./db";
import { log } from "./log";
import {
	addMemories,
	deleteMemory,
	formatMemoriesForPrompt,
	listMemories,
	searchMemories,
} from "./memory";
import { createModel, createTitleModel, SYSTEM_PROMPT } from "./model";
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
import { createMemoryTool, createRagTools, staticTools } from "./tools";

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
	await deleteThread(db, c.req.param("id"), userId);
	return c.json({ ok: true });
});

app.get("/api/threads/:id/messages", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const thread = await getThread(db, c.req.param("id"));
	if (!thread || thread.userId !== userId) return c.json([], 200);
	const rows = await getMessagesByThreadId(db, c.req.param("id"));
	return c.json(rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts })));
});

app.post("/api/threads/:id/generate-title", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const { text } = await c.req
		.json<{ text?: string }>()
		.catch(() => ({ text: undefined }));
	if (!text) return c.json({ title: "新对话" });

	const db = createDb(c.env.DB);
	const threadId = c.req.param("id");

	try {
		// Ensure thread exists (may race with /api/chat's ensureThread)
		await ensureThread(db, threadId, userId);

		const title = await generateLLMTitle(
			c.env,
			`为以下用户消息生成简洁中文标题，4-8个字，无标点无引号，只回复标题：\n${text}`,
		);

		if (title) {
			await updateThreadTitle(db, threadId, userId, title);
		}

		return c.json({ title: title || text.slice(0, 50) });
	} catch (e) {
		log.error({
			module: "chat",
			msg: "generate-title failed",
			error: String(e),
		});
		return c.json({ title: text.slice(0, 50) });
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

	// Auto-link user if not already linked
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
				// Mark paper as failed in DB so it doesn't stay stuck
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
		.select({
			r2Key: papers.r2Key,
			title: userPapers.title,
		})
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

	const md = await getPaperMarkdown(paperId, {
		db,
		r2: c.env.R2,
		userId,
	});
	if (!md) return c.json({ error: "未找到" }, 404);

	const excerpt = md.slice(0, 500);
	const fullName = fileName
		? fileExt
			? `${fileName}.${fileExt}`
			: fileName
		: null;
	const hintStr = fullName ? `\n文件名：${fullName}` : "";
	const title = await generateLLMTitle(
		c.env,
		`根据以下资料内容生成简洁中文标题，6-12个字，无标点无引号，只回复标题：${hintStr}\n${excerpt}`,
	);

	if (title) {
		await renameUserPaper(db, userId, paperId, title);
	}

	return c.json({ title });
});

// ── Shared Helpers ──────────────────────────────────────────────────────────

async function generateLLMTitle(env: Env, prompt: string): Promise<string> {
	const result = streamText({
		model: createTitleModel(env),
		prompt,
		providerOptions: { openrouter: { reasoning: { effort: "none" } } },
	});
	let title = "";
	for await (const chunk of result.textStream) {
		title += chunk;
	}
	return title.trim().replace(/["""''「」『』。，！？、：；]/g, "");
}

// ── Memories (proxy to Mem0 Cloud) ──────────────────────────────────────────

app.get("/api/memories", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	if (!c.env.MEM0_API_KEY)
		return c.json({ error: "记忆服务未配置" }, 503);
	return c.json(await listMemories(c.env, userId));
});

app.post("/api/memories", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	if (!c.env.MEM0_API_KEY)
		return c.json({ error: "记忆服务未配置" }, 503);
	const { text } = await c.req.json<{ text: string }>();
	if (!text?.trim()) return c.json({ error: "内容不能为空" }, 400);
	const result = await addMemories(
		c.env,
		[{ role: "user", content: text.trim() }],
		userId,
	);
	return c.json({ ok: true, memories: result });
});

app.delete("/api/memories/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	if (!c.env.MEM0_API_KEY) return c.json({ ok: true });
	await deleteMemory(c.env, c.req.param("id"));
	return c.json({ ok: true });
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ status: "ok" }));

// ── Helpers ───────────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: UIMessage wire format
type WireMessage = Record<string, any>;

/**
 * Resolve data: URLs in wire messages BEFORE convertToModelMessages.
 * Strip "data:<mime>;base64," prefix → raw base64 string for ALL file types.
 * This prevents the AI SDK's downloadAssets from trying to fetch data: URLs.
 * The @ai-sdk/openai provider re-wraps the base64 into the correct wire format
 * (image_url for images, { file: { file_data } } for PDFs, etc.).
 */
function resolveDataUrls(messages: WireMessage[]): WireMessage[] {
	return messages.map((msg) => {
		if (!Array.isArray(msg.parts)) return msg;
		const parts = msg.parts.map(
			// biome-ignore lint/suspicious/noExplicitAny: flexible wire part
			(part: any) => {
				if (typeof part.url !== "string") return part;
				const match = part.url.match(/^data:([^;]+);base64,(.+)$/s);
				if (!match) return part;
				return { ...part, url: match[2], mediaType: match[1] };
			},
		);
		return { ...msg, parts };
	});
}

// ── Chat (AI SDK streamText + Assistant-UI) ──────────────────────────────────

app.post("/api/chat", async (c) => {
	try {
		const { messages } = await c.req.json<{
			messages: WireMessage[];
		}>();
		const threadId = c.req.header("x-thread-id") || undefined;
		const userId = await requireUserId(c);

		if (!c.env.LLM_API_KEY)
			return c.json({ error: "缺少 LLM_API_KEY 配置" }, 500);
		if (!c.env.LLM_MODEL) return c.json({ error: "缺少 LLM_MODEL 配置" }, 500);

		const db = createDb(c.env.DB);
		const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

		// ── Persist user message ──────────────────────────────────────────────
		if (threadId && userId && lastUserMsg) {
			try {
				await ensureThread(db, threadId, userId);
				const parts = lastUserMsg.parts?.length
					? lastUserMsg.parts
					: [{ type: "text" as const, text: lastUserMsg.content ?? "" }];
				await saveMessages(db, [
					{
						id: lastUserMsg.id ?? crypto.randomUUID(),
						threadId,
						role: "user",
						parts: parts as unknown[],
						createdAt: Math.floor(Date.now() / 1000),
					},
				]);
				await touchThread(db, threadId, userId);
			} catch (e) {
				log.error({
					module: "chat",
					msg: "persist user msg failed",
					error: String(e),
				});
			}
		}

		// ── Retrieve relevant memories ───────────────────────────────────────
		let retrievedMemories: Awaited<ReturnType<typeof searchMemories>> = [];
		if (userId && c.env.MEM0_API_KEY) {
			const lastText = lastUserMsg?.parts
				?.filter((p: { type: string }) => p.type === "text")
				.map((p: { text?: string }) => p.text ?? "")
				.join(" ");
			if (lastText) {
				retrievedMemories = await searchMemories(c.env, lastText, userId);
			}
		}

		// ── Build tools ─────────────────────────────────────────────────────
		const systemPrompt = SYSTEM_PROMPT + formatMemoriesForPrompt(retrievedMemories);

		// biome-ignore lint/suspicious/noExplicitAny: tool generics incompatible with Record
		let memoryTools: Record<string, any> = {};
		if (userId && c.env.MEM0_API_KEY) {
			memoryTools = createMemoryTool({ env: c.env, userId });
		}

		// biome-ignore lint/suspicious/noExplicitAny: tool generics incompatible with Record
		let ragTools: Record<string, any> = {};
		if (userId && c.env.VECTORIZE && c.env.EMBEDDING_BASE_URL) {
			try {
				const userLinks = await db
					.select({ paperId: userPapers.paperId })
					.from(userPapers)
					.where(eq(userPapers.userId, userId));
				ragTools = createRagTools({
					paperIds: userLinks.map((l) => l.paperId),
					db,
					vectorize: c.env.VECTORIZE,
					env: c.env,
				});
			} catch {
				// Vectorize only works remotely; silently skip in local dev
			}
		}

		// ── Extract memories concurrently (fire-and-forget, async on Mem0) ──
		if (userId && c.env.MEM0_API_KEY) {
			c.executionCtx.waitUntil(
				addMemories(
					c.env,
					messages
						.filter(
							(m: WireMessage) =>
								m.role === "user" || m.role === "assistant",
						)
						.slice(-6)
						.map((m: WireMessage) => ({
							role: m.role as string,
							content:
								m.parts
									?.filter((p: { type: string }) => p.type === "text")
									.map((p: { text?: string }) => p.text ?? "")
									.join(" ") ?? "",
						})),
					userId,
				),
			);
		}

		// ── Stream chat response ───────────────────────────��─────────────────
		const wrappedModel = createModel(c.env);

		let resolveFinish!: () => void;
		const finishPromise = new Promise<void>((r) => {
			resolveFinish = r;
		});

		const uiStream = createUIMessageStream({
			execute: async ({ writer }) => {
				// Send retrieved memories as data event
				if (retrievedMemories.length > 0) {
					writer.write({
						type: "data-mem0-get" as "data-mem0-get",
						data: retrievedMemories,
					});
				}

				const modelMessages = await convertToModelMessages(
					// biome-ignore lint/suspicious/noExplicitAny: wire format → UIMessage
					resolveDataUrls(messages) as any,
				);

				const lastModelMsg = modelMessages[modelMessages.length - 1];
				const isHitlContinuation =
					lastModelMsg?.role === "tool" ||
					(lastModelMsg?.role === "assistant" &&
						Array.isArray(lastModelMsg.content) &&
						lastModelMsg.content.some(
							(p: { type: string }) => p.type === "tool-result",
						));

				const chatResult = streamText({
					model: wrappedModel,
					system: systemPrompt,
					messages: modelMessages,
					tools: { ...staticTools, ...memoryTools, ...ragTools },
					stopWhen: stepCountIs(5),
					...(isHitlContinuation && {
						providerOptions: {
							openrouter: { reasoning: { effort: "none" } },
						},
					}),
				});

				writer.merge(chatResult.toUIMessageStream({ sendReasoning: true }));
			},
			onFinish: async ({ messages: finishedMessages }) => {
				try {
					if (threadId && userId && finishedMessages.length > 0) {
						const assistantMsgs = finishedMessages.filter(
							(m) => m.role !== "user",
						);
						if (assistantMsgs.length > 0) {
							const now = Math.floor(Date.now() / 1000);
							await saveMessages(
								db,
								assistantMsgs.map((m) => ({
									id: m.id,
									threadId,
									role: m.role,
									parts: m.parts as unknown[],
									createdAt: now,
								})),
							);
							await touchThread(db, threadId, userId);
						}
					}
				} catch (e) {
					log.error({
						module: "chat",
						msg: "persist assistant msgs failed",
						error: String(e),
					});
				} finally {
					resolveFinish();
				}
			},
			generateId: () => crypto.randomUUID(),
		});

		c.executionCtx.waitUntil(finishPromise);
		return createUIMessageStreamResponse({ stream: uiStream });
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : "未知错误";
		log.error({ module: "chat", msg });
		return c.json({ error: msg }, 500);
	}
});

export default app;

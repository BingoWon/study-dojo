import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	stepCountIs,
	streamText,
} from "ai";
import { Hono } from "hono";
import { getUserId } from "./auth";
import {
	createDb,
	deleteThread as dbDeleteThread,
	updateThreadTitle as dbUpdateThreadTitle,
	ensureThread,
	getMessagesByThreadId,
	getThread,
	getThreadsByUserId,
	saveMessages,
	touchThread,
} from "./db";
import { createModel, createTitleModel, SYSTEM_PROMPT } from "./model";
import type { ChatRequestMessage } from "./openrouter";
import {
	deletePaper,
	getPaperMarkdown,
	ingestMarkdown,
	ingestPdf,
	listPapers,
	retrieveContext,
} from "./rag";
import { tools } from "./tools";

const app = new Hono<{ Bindings: Env }>();

// ── Thread CRUD ──────────────────────────────────────────────────────────────

app.get("/api/threads", async (c) => {
	const userId = getUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	return c.json(await getThreadsByUserId(db, userId));
});

app.patch("/api/threads/:id", async (c) => {
	const userId = getUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const { title } = await c.req.json<{ title: string }>();
	const db = createDb(c.env.DB);
	await dbUpdateThreadTitle(db, c.req.param("id"), userId, title);
	return c.json({ ok: true });
});

app.delete("/api/threads/:id", async (c) => {
	const userId = getUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	await dbDeleteThread(db, c.req.param("id"), userId);
	return c.json({ ok: true });
});

app.get("/api/threads/:id/messages", async (c) => {
	const userId = getUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const thread = await getThread(db, c.req.param("id"));
	if (!thread || thread.userId !== userId) return c.json([], 200);
	const rows = await getMessagesByThreadId(db, c.req.param("id"));
	return c.json(rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts })));
});

// ── RAG: Document Ingest ─────────────────────────────────────────────────────

app.post("/api/documents", async (c) => {
	const userId = getUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const { markdown, source } = await c.req.json<{
		markdown: string;
		source?: string;
	}>();
	if (!markdown) return c.json({ error: "缺少 markdown" }, 400);
	const db = createDb(c.env.DB);
	const result = await ingestMarkdown(markdown, {
		source,
		userId: userId || undefined,
		db,
		vectorize: c.env.VECTORIZE,
		env: c.env,
	});
	return c.json(result, 201);
});

// ── Papers CRUD ──────────────────────────────────────────────────────────────

app.get("/api/papers", async (c) => {
	const userId = getUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	return c.json(await listPapers(db, userId));
});

app.post("/api/papers", async (c) => {
	const userId = getUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const formData = await c.req.formData();
	const file = formData.get("file") as File | null;
	const title = (formData.get("title") as string) || file?.name || "未命名论文";

	if (!file?.name.endsWith(".pdf")) {
		return c.json({ error: "请上传 PDF 文件" }, 400);
	}

	const db = createDb(c.env.DB);
	const buffer = await file.arrayBuffer();

	const result = await ingestPdf(buffer, {
		title,
		userId,
		db,
		vectorize: c.env.VECTORIZE,
		r2: c.env.R2,
		env: c.env,
	});

	return c.json(result, 201);
});

app.delete("/api/papers/:id", async (c) => {
	const userId = getUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	await deletePaper(c.req.param("id"), { db, r2: c.env.R2 });
	return c.json({ ok: true });
});

app.get("/api/papers/:id/download", async (c) => {
	const userId = getUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const db = createDb(c.env.DB);
	const { papers } = await import("./schema");
	const { eq } = await import("drizzle-orm");
	const [paper] = await db
		.select()
		.from(papers)
		.where(eq(papers.id, c.req.param("id")))
		.limit(1);

	if (!paper || paper.userId !== userId)
		return c.json({ error: "未找到" }, 404);

	const obj = await c.env.R2.get(paper.r2Key);
	if (!obj) return c.json({ error: "文件不存在" }, 404);

	return new Response(obj.body, {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${encodeURIComponent(paper.title)}.pdf"`,
		},
	});
});

app.get("/api/papers/:id/markdown", async (c) => {
	const userId = getUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const md = await getPaperMarkdown(c.req.param("id"), {
		db,
		r2: c.env.R2,
		userId,
	});
	if (md === null) return c.json({ error: "未找到" }, 404);
	return c.text(md);
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ status: "ok" }));

// ── Chat (Mastra model + AI SDK streamText + Assistant-UI) ────────────────────

app.post("/api/chat", async (c) => {
	try {
		const { messages } = await c.req.json<{
			messages: ChatRequestMessage[];
		}>();
		const threadId = c.req.header("x-thread-id") || undefined;
		const userId = getUserId(c);

		if (!c.env.API_KEY) return c.json({ error: "缺少 API_KEY 配置" }, 500);
		if (!c.env.MODEL) return c.json({ error: "缺少 MODEL 配置" }, 500);

		const db = createDb(c.env.DB);

		// ── Persist user message ──────────────────────────────────────────────
		if (threadId && userId) {
			try {
				await ensureThread(db, threadId, userId);
				const lastUserMsg = [...messages]
					.reverse()
					.find((m) => m.role === "user");
				if (lastUserMsg) {
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
					await touchThread(db, threadId);
				}
			} catch (e) {
				console.error("[Worker] persist user msg:", e);
			}
		}

		// ── RAG: retrieve relevant context ───────────────────────────────────
		const lastUserText = [...messages]
			.reverse()
			.find((m) => m.role === "user")
			?.parts?.filter(
				(p): p is { type: "text"; text: string } => p.type === "text",
			)
			.map((p) => p.text)
			.join(" ");

		let systemPrompt = c.env.SYSTEM_PROMPT || SYSTEM_PROMPT;
		if (lastUserText && c.env.VECTORIZE && c.env.EMBEDDING_BASE_URL) {
			try {
				const ragContext = await retrieveContext(lastUserText, {
					userId: userId || "anonymous",
					db,
					vectorize: c.env.VECTORIZE,
					env: c.env,
				});
				if (ragContext) {
					systemPrompt += `\n\n以下是与用户问题相关的参考资料，请结合这些内容回答：\n\n${ragContext}`;
				}
			} catch {
				// Vectorize 仅支持远程运行，本地开发时静默跳过
			}
		}

		// ── Determine if title generation is needed ──────────────────────────
		const isFirstMessage =
			messages.filter((m) => m.role === "user").length === 1;
		const firstUserText = isFirstMessage
			? messages
					.filter((m) => m.role === "user")
					.flatMap((m) =>
						(m.parts ?? [])
							.filter(
								(p): p is { type: "text"; text: string } => p.type === "text",
							)
							.map((p) => p.text),
					)
					.join(" ")
					.slice(0, 200)
			: "";

		// ── Stream with concurrent title generation ──────────────────────────
		const wrappedModel = createModel(c.env);

		let resolveFinish!: () => void;
		const finishPromise = new Promise<void>((r) => {
			resolveFinish = r;
		});

		const uiStream = createUIMessageStream({
			execute: async ({ writer }) => {
				const chatResult = streamText({
					model: wrappedModel,
					system: systemPrompt,
					messages: messages.map((m) => ({
						role: m.role as "user" | "assistant" | "system",
						content:
							m.parts
								?.filter((p) => p.type === "text")
								.map((p) => p.text ?? "")
								.join("") ??
							m.content ??
							"",
					})),
					tools,
					stopWhen: stepCountIs(5),
				});

				let titlePromise: Promise<void> | null = null;

				if (firstUserText && threadId && userId) {
					titlePromise = (async () => {
						try {
							const titleResult = streamText({
								model: createTitleModel(c.env),
								prompt: `为以下用户消息生成简洁中文标题，4-8个字，无标点无引号，只回复标题：\n${firstUserText}`,
							});

							let fullTitle = "";
							for await (const chunk of titleResult.textStream) {
								fullTitle += chunk;
								writer.write({
									type: "data-title-delta",
									data: chunk,
								});
							}

							const cleaned = fullTitle
								.trim()
								.replace(/["""''「」『』。，！？、：；]/g, "");
							if (cleaned) {
								await dbUpdateThreadTitle(db, threadId, userId, cleaned);
							}
						} catch (e) {
							console.error("[Worker] title stream:", e);
						}
					})();
				}

				writer.merge(chatResult.toUIMessageStream({ sendReasoning: true }));

				if (titlePromise) await titlePromise;
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
							await touchThread(db, threadId);
						}
					}
				} catch (e) {
					console.error("[Worker] persist assistant msgs:", e);
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
		console.error("[Worker] /api/chat error:", msg);
		return c.json({ error: msg }, 500);
	}
});

export default app;

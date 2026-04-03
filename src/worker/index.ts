import {
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
import type { ChatMessagePart, ChatRequestMessage } from "./openrouter";
import {
	checkOcrJob,
	finalizePaper,
	getPaperMarkdown,
	isUserLinked,
	listUserPapers,
	renameUserPaper,
	retrieveContext,
	unlinkUserPaper,
	uploadPdf,
} from "./rag";
import { papers, userPapers } from "./schema";
import { tools } from "./tools";

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
	await dbUpdateThreadTitle(db, c.req.param("id"), userId, title);
	return c.json({ ok: true });
});

app.delete("/api/threads/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	await dbDeleteThread(db, c.req.param("id"), userId);
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

// ── Papers ───────────────────────────────────────────────────────────────────

app.get("/api/papers", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	return c.json(await listUserPapers(db, userId));
});

app.post("/api/papers", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	if (!c.env.PADDLE_OCR_TOKEN)
		return c.json({ error: "缺少 PADDLE_OCR_TOKEN 配置" }, 500);

	const formData = await c.req.formData();
	const file = formData.get("file") as File | null;

	if (!file?.name.endsWith(".pdf")) {
		return c.json({ error: "请上传 PDF 文件" }, 400);
	}

	const db = createDb(c.env.DB);
	const buffer = await file.arrayBuffer();

	const result = await uploadPdf(buffer, {
		userId,
		db,
		r2: c.env.R2,
		ocrToken: c.env.PADDLE_OCR_TOKEN,
	});

	return c.json(result, 201);
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

app.get("/api/papers/:id/status", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	if (!c.env.PADDLE_OCR_TOKEN)
		return c.json({ error: "缺少 PADDLE_OCR_TOKEN 配置" }, 500);

	const db = createDb(c.env.DB);
	const paperId = c.req.param("id");

	if (!(await isUserLinked(db, userId, paperId)))
		return c.json({ error: "未找到" }, 404);

	const [paper] = await db
		.select()
		.from(papers)
		.where(eq(papers.id, paperId))
		.limit(1);
	if (!paper) return c.json({ error: "未找到" }, 404);

	if (paper.status !== "processing" || !paper.jobId) {
		return c.json({ status: paper.status, chunks: paper.chunks });
	}

	const job = await checkOcrJob(paper.jobId, c.env.PADDLE_OCR_TOKEN);

	if (job.state === "failed") {
		await db
			.update(papers)
			.set({ status: "failed" })
			.where(eq(papers.id, paperId));
		return c.json({ status: "failed", error: job.error });
	}

	if (job.state !== "done") {
		return c.json({ status: "processing", progress: job.progress });
	}

	if (!job.jsonUrl) {
		return c.json({ status: "failed", error: "OCR 结果 URL 缺失" });
	}

	try {
		const result = await finalizePaper(paperId, job.jsonUrl, {
			db,
			r2: c.env.R2,
			vectorize: c.env.VECTORIZE,
			env: c.env,
		});
		return c.json({ status: "ready", chunks: result.chunks });
	} catch (e) {
		console.error("[Worker] finalize paper:", e);
		await db
			.update(papers)
			.set({ status: "failed" })
			.where(eq(papers.id, paperId));
		return c.json({
			status: "failed",
			error: e instanceof Error ? e.message : "处理失败",
		});
	}
});

app.get("/api/papers/:id/download", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const db = createDb(c.env.DB);
	const paperId = c.req.param("id");

	if (!(await isUserLinked(db, userId, paperId)))
		return c.json({ error: "未找到" }, 404);

	const [paper] = await db
		.select()
		.from(papers)
		.where(eq(papers.id, paperId))
		.limit(1);
	if (!paper) return c.json({ error: "未找到" }, 404);

	const obj = await c.env.R2.get(paper.r2Key);
	if (!obj) return c.json({ error: "文件不存在" }, 404);

	// Use user's custom title for download filename
	const [link] = await db
		.select({ title: userPapers.title })
		.from(userPapers)
		.where(and(eq(userPapers.userId, userId), eq(userPapers.paperId, paperId)))
		.limit(1);
	const filename = encodeURIComponent(link?.title ?? "document");

	return new Response(obj.body, {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${filename}.pdf"; filename*=UTF-8''${filename}.pdf`,
		},
	});
});

app.get("/api/papers/:id/markdown", async (c) => {
	const userId = await requireUserId(c);
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

app.post("/api/papers/:id/generate-title", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const db = createDb(c.env.DB);
	const paperId = c.req.param("id");

	const md = await getPaperMarkdown(paperId, {
		db,
		r2: c.env.R2,
		userId,
	});
	if (!md) return c.json({ error: "未找到" }, 404);

	const excerpt = md.slice(0, 500);
	const titleModel = createTitleModel(c.env);
	const result = streamText({
		model: titleModel,
		prompt: `根据以下论文内容生成简洁中文标题，6-12个字，无标点无引号，只回复标题：\n${excerpt}`,
	});

	let title = "";
	for await (const chunk of result.textStream) {
		title += chunk;
	}
	title = title.trim().replace(/["""''「」『』。，！？、：；]/g, "");

	if (title) {
		await renameUserPaper(db, userId, paperId, title);
	}

	return c.json({ title });
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ status: "ok" }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractLastUserText(messages: ChatRequestMessage[]): string {
	return (
		[...messages]
			.reverse()
			.find((m) => m.role === "user")
			?.parts?.filter(
				(p): p is { type: "text"; text: string } => p.type === "text",
			)
			.map((p) => p.text)
			.join(" ") ?? ""
	);
}

function toAIMessages(msgs: ChatRequestMessage[]) {
	return msgs.map((m) => {
		const role = m.role as "user" | "assistant" | "system";
		const parts = m.parts ?? [];

		if (role !== "user") {
			const text =
				parts
					.filter(
						(p): p is Extract<ChatMessagePart, { type: "text" }> =>
							p.type === "text",
					)
					.map((p) => p.text)
					.join("") ||
				m.content ||
				"";
			return { role, content: text };
		}

		const hasMedia = parts.some(
			(p) => p.type === "image" || p.type === "image_url",
		);
		if (!hasMedia) {
			const text =
				parts
					.filter(
						(p): p is Extract<ChatMessagePart, { type: "text" }> =>
							p.type === "text",
					)
					.map((p) => p.text)
					.join("") ||
				m.content ||
				"";
			return { role, content: text };
		}

		const content: Array<
			{ type: "text"; text: string } | { type: "image"; image: string }
		> = [];
		for (const p of parts) {
			if (p.type === "text" && p.text) {
				content.push({ type: "text", text: p.text });
			} else if (p.type === "image") {
				const url = p.image ?? p.url;
				if (url) content.push({ type: "image", image: url });
			} else if (p.type === "image_url") {
				const url = p.image_url?.url ?? p.url;
				if (url) content.push({ type: "image", image: url });
			}
		}

		return { role, content };
	});
}

// ── Chat (AI SDK streamText + Assistant-UI) ──────────────────────────────────

app.post("/api/chat", async (c) => {
	try {
		const { messages } = await c.req.json<{
			messages: ChatRequestMessage[];
		}>();
		const threadId = c.req.header("x-thread-id") || undefined;
		const userId = await requireUserId(c);

		if (!c.env.API_KEY) return c.json({ error: "缺少 API_KEY 配置" }, 500);
		if (!c.env.MODEL) return c.json({ error: "缺少 MODEL 配置" }, 500);

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
				console.error("[Worker] persist user msg:", e);
			}
		}

		// ── RAG: retrieve relevant context ───────────────────────────────────
		const lastUserText = extractLastUserText(messages);

		let systemPrompt = c.env.SYSTEM_PROMPT || SYSTEM_PROMPT;
		if (lastUserText && userId && c.env.VECTORIZE && c.env.EMBEDDING_BASE_URL) {
			try {
				// Get all user's paper IDs for RAG
				const userLinks = await db
					.select({ paperId: userPapers.paperId })
					.from(userPapers)
					.where(eq(userPapers.userId, userId));
				const paperIds = userLinks.map((l) => l.paperId);

				if (paperIds.length > 0) {
					const ragContext = await retrieveContext(lastUserText, {
						paperIds,
						db,
						vectorize: c.env.VECTORIZE,
						env: c.env,
					});
					if (ragContext) {
						systemPrompt += `\n\n以下是与用户问题相关的参考资料，请结合这些内容回答：\n\n${ragContext}`;
					}
				}
			} catch {
				// Vectorize only works remotely; silently skip in local dev
			}
		}

		// ── Determine if title generation is needed ──────────────────────────
		const userMessages = messages.filter((m) => m.role === "user");
		const isFirstMessage = userMessages.length === 1;
		const firstUserText = isFirstMessage
			? extractLastUserText(userMessages).slice(0, 200)
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
					messages: toAIMessages(messages),
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
							await touchThread(db, threadId, userId);
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

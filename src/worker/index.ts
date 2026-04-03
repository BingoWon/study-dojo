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
import { createModel, createTitleModel, SYSTEM_PROMPT } from "./model";
import {
	checkPaperByHash,
	getPaperMarkdown,
	ingestPdf,
	listUserPapers,
	renameUserPaper,
	unlinkUserPaper,
} from "./rag";
import { papers, userPapers } from "./schema";
import { createRagTools, staticTools } from "./tools";

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
	if (!c.env.PADDLE_OCR_TOKEN)
		return c.json({ error: "缺少 PADDLE_OCR_TOKEN 配置" }, 500);

	const formData = await c.req.formData();
	const file = formData.get("file") as File | null;

	if (!file?.name.endsWith(".pdf")) {
		return c.json({ error: "请上传 PDF 文件" }, 400);
	}

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

			try {
				await ingestPdf(buffer, {
					fileName: file.name.replace(/\.pdf$/i, ""),
					userId,
					db,
					r2: c.env.R2,
					vectorize: c.env.VECTORIZE,
					env: c.env,
					onStatus: (status, data) => send("status", { status, ...data }),
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : "处理失败";
				console.error("[Worker] ingest paper:", msg);
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

	const filename = encodeURIComponent(row.title);
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
	const { fileName } = await c.req
		.json<{ fileName?: string }>()
		.catch(() => ({ fileName: undefined }));

	const md = await getPaperMarkdown(paperId, {
		db,
		r2: c.env.R2,
		userId,
	});
	if (!md) return c.json({ error: "未找到" }, 404);

	const excerpt = md.slice(0, 500);
	const hint = fileName ? `\n文件名参考：${fileName}` : "";
	const titleModel = createTitleModel(c.env);
	const result = streamText({
		model: titleModel,
		prompt: `根据以下论文内容生成简洁中文标题，6-12个字，无标点无引号，只回复标题：${hint}\n${excerpt}`,
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

// biome-ignore lint/suspicious/noExplicitAny: UIMessage wire format
type WireMessage = Record<string, any>;

function extractLastUserText(messages: WireMessage[]): string {
	const last = [...messages].reverse().find((m) => m.role === "user");
	if (!last?.parts) return last?.content ?? "";
	return (
		last.parts
			.filter((p: { type: string }) => p.type === "text")
			.map((p: { text: string }) => p.text)
			.join(" ") ?? ""
	);
}

// ── Chat (AI SDK streamText + Assistant-UI) ──────────────────────────────────

app.post("/api/chat", async (c) => {
	try {
		const { messages } = await c.req.json<{
			messages: WireMessage[];
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

		// ── Build tools (static + RAG if available) ─────────────────────────
		const systemPrompt = c.env.SYSTEM_PROMPT || SYSTEM_PROMPT;

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
				const modelMessages = await convertToModelMessages(
					// biome-ignore lint/suspicious/noExplicitAny: wire format → UIMessage
					messages as any,
				);
				const chatResult = streamText({
					model: wrappedModel,
					system: systemPrompt,
					messages: modelMessages,
					tools: { ...staticTools, ...ragTools },
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
								await updateThreadTitle(db, threadId, userId, cleaned);
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

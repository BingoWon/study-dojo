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
	updateThreadPersona,
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
import {
	createModel,
	createTitleModel,
	DEFAULT_PERSONA,
	getSystemPrompt,
	isValidPersona,
} from "./model";
import {
	checkDocByHash,
	classifyFile,
	getDocumentChunks,
	getDocumentMarkdown,
	getDocumentMeta,
	ingestFile,
	listUserDocuments,
	renameUserDocument,
	unlinkUserDocument,
} from "./rag";
import { documents, userDocuments } from "./schema";
import {
	createDocTools,
	createExaTools,
	createMemoryTool,
	hitlTools,
	staticTools,
} from "./tools";

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
	const body = await c.req.json<{ title?: string; persona?: string }>();
	const db = createDb(c.env.DB);
	const threadId = c.req.param("id");
	if (body.title) {
		await updateThreadTitle(db, threadId, userId, body.title);
	}
	if (body.persona && isValidPersona(body.persona)) {
		await updateThreadPersona(db, threadId, userId, body.persona);
	}
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

// ── ElevenLabs Scribe token (STT) ───────────────────────────────────────────
app.post("/api/scribe-token", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const apiKey = c.env.ELEVENLABS_API_KEY;
	if (!apiKey)
		return c.json({ error: "ELEVENLABS_API_KEY not configured" }, 500);

	const res = await fetch(
		"https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
		{ method: "POST", headers: { "xi-api-key": apiKey } },
	);
	if (!res.ok) return c.json({ error: "语音识别服务暂不可用" }, 502);

	const data = (await res.json()) as { token: string };
	return c.json({ token: data.token });
});

// ── ElevenLabs TTS (text-to-speech) ─────────────────────────────────────────
app.post("/api/tts", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const apiKey = c.env.ELEVENLABS_API_KEY;
	if (!apiKey)
		return c.json({ error: "ELEVENLABS_API_KEY not configured" }, 500);

	const { text, voiceId } = await c.req.json<{
		text: string;
		voiceId?: string;
	}>();
	if (!text?.trim()) return c.json({ error: "text is required" }, 400);

	const voice = voiceId || c.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
	const res = await fetch(
		`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
		{
			method: "POST",
			headers: {
				"xi-api-key": apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				text,
				model_id: "eleven_v3",
				output_format: "mp3_44100_128",
				language_code: "zh",
			}),
		},
	);

	if (!res.ok) return c.json({ error: "语音合成服务暂不可用" }, 502);

	return new Response(res.body, {
		headers: { "Content-Type": "audio/mpeg" },
	});
});

// ── ElevenLabs Conversational AI (signed URL for voice mode) ───────────────
app.get("/api/voice-signed-url", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未���权" }, 401);

	const apiKey = c.env.ELEVENLABS_API_KEY;
	const agentId = c.env.ELEVENLABS_AGENT_ID;
	if (!apiKey || !agentId) return c.json({ error: "语音对话服务未���置" }, 500);

	const res = await fetch(
		`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
		{ headers: { "xi-api-key": apiKey } },
	);
	if (!res.ok) return c.json({ error: "语音对话服务暂不可用" }, 502);

	const data = (await res.json()) as { signed_url: string };
	return c.json({ signedUrl: data.signed_url });
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

// ── Documents ───────────────────────────────────────────────────────────────

app.get("/api/documents", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	return c.json(await listUserDocuments(db, userId));
});

app.get("/api/documents/check", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const hash = c.req.query("hash");
	if (!hash) return c.json({ error: "缺少 hash 参数" }, 400);

	const db = createDb(c.env.DB);
	const result = await checkDocByHash(db, hash);
	if (!result.exists) return c.json({ exists: false });

	const now = Math.floor(Date.now() / 1000);
	await db
		.insert(userDocuments)
		.values({ userId, docId: result.docId, createdAt: now })
		.onConflictDoNothing();

	return c.json(result);
});

app.post("/api/documents", async (c) => {
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

			let ingestDocId: string | undefined;
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
						if (data?.docId) ingestDocId = data.docId as string;
						send("status", { status, ...data });
					},
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : "处理失败";
				log.error({ module: "ingest", msg, docId: ingestDocId });
				if (ingestDocId) {
					await db
						.update(documents)
						.set({ status: "failed" })
						.where(eq(documents.id, ingestDocId))
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

app.patch("/api/documents/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const { title } = await c.req.json<{ title: string }>();
	const db = createDb(c.env.DB);
	await renameUserDocument(db, userId, c.req.param("id"), title);
	return c.json({ ok: true });
});

app.delete("/api/documents/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	await unlinkUserDocument(db, userId, c.req.param("id"));
	return c.json({ ok: true });
});

app.get("/api/documents/:id/download", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const db = createDb(c.env.DB);
	const docId = c.req.param("id");

	const [row] = await db
		.select({
			r2Key: documents.r2Key,
			title: userDocuments.title,
		})
		.from(userDocuments)
		.innerJoin(documents, eq(documents.id, userDocuments.docId))
		.where(
			and(eq(userDocuments.userId, userId), eq(userDocuments.docId, docId)),
		)
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

app.get("/api/documents/:id/markdown", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const lang = (c.req.query("lang") as "original" | "zh") || "original";
	const db = createDb(c.env.DB);
	const md = await getDocumentMarkdown(c.req.param("id"), {
		db,
		r2: c.env.R2,
		userId,
		lang,
	});
	if (md === null) return c.json({ error: "未找到" }, 404);
	return c.text(md);
});

app.get("/api/documents/:id/chunks", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const docId = c.req.param("id");
	const doc = await getDocumentMeta(db, docId, userId);
	if (!doc) return c.json({ error: "未找到" }, 404);
	const rows = await getDocumentChunks(db, docId);
	return c.json({ total: rows.length, chunks: rows.map((r) => r.content) });
});

app.post("/api/documents/:id/generate-title", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const db = createDb(c.env.DB);
	const docId = c.req.param("id");
	const { fileName, fileExt } = await c.req
		.json<{ fileName?: string; fileExt?: string }>()
		.catch(() => ({ fileName: undefined, fileExt: undefined }));

	const fullName = fileName
		? fileExt
			? `${fileName}.${fileExt}`
			: fileName
		: null;

	const md = await getDocumentMarkdown(docId, {
		db,
		r2: c.env.R2,
		userId,
	});

	// Build prompt from markdown content (preferred) or filename (fallback)
	const excerpt = md?.slice(0, 500);
	if (!excerpt && !fullName) return c.json({ error: "未找到" }, 404);

	const hintStr = fullName ? `\n文件名：${fullName}` : "";
	const prompt = excerpt
		? `根据以下文档内容生成简洁中文标题，6-12个字，无标点无引号，只回复标题：${hintStr}\n${excerpt}`
		: `根据文件名生成简洁中文标题，6-12个字，无标点无引号，只回复标题：\n${fullName}`;
	const title = await generateLLMTitle(c.env, prompt);

	if (title) {
		await renameUserDocument(db, userId, docId, title);
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
	if (!c.env.MEM0_API_KEY) return c.json({ error: "记忆服务未配置" }, 503);
	return c.json(await listMemories(c.env, userId));
});

app.post("/api/memories", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	if (!c.env.MEM0_API_KEY) return c.json({ error: "记忆服务未配置" }, 503);
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
		const personaRaw = c.req.header("x-persona") || DEFAULT_PERSONA;
		if (!isValidPersona(personaRaw)) {
			log.warn({ module: "chat", msg: "invalid persona", persona: personaRaw });
		}
		const persona = isValidPersona(personaRaw) ? personaRaw : DEFAULT_PERSONA;
		const userId = await requireUserId(c);

		if (!c.env.LLM_API_KEY)
			return c.json({ error: "缺少 LLM_API_KEY 配置" }, 500);
		if (!c.env.LLM_MODEL) return c.json({ error: "缺少 LLM_MODEL 配置" }, 500);

		const db = createDb(c.env.DB);

		// Trim text parts in all messages
		for (const msg of messages) {
			if (Array.isArray(msg.parts)) {
				for (const p of msg.parts) {
					if (p.type === "text" && typeof p.text === "string") {
						p.text = p.text.trim();
					}
				}
			}
		}

		const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

		// ── Persist user message ──────────────────────────────────────────────
		if (threadId && userId && lastUserMsg) {
			try {
				await ensureThread(db, threadId, userId, { persona });
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

		// ── Auto-generate title on first message (fire-and-forget) ──────────
		const userMessages = messages.filter((m: WireMessage) => m.role === "user");
		if (threadId && userId && userMessages.length === 1) {
			const firstText = userMessages[0].parts
				?.filter((p: { type: string }) => p.type === "text")
				.map((p: { text?: string }) => p.text ?? "")
				.join(" ")
				?.slice(0, 200);
			if (firstText) {
				c.executionCtx.waitUntil(
					generateLLMTitle(
						c.env,
						`为以下用户消息生成简洁中文标题，4-8个字，无标点无引号，只回复标题：\n${firstText}`,
					)
						.then(async (title) => {
							if (title) {
								await updateThreadTitle(db, threadId, userId, title);
							}
						})
						.catch(() => {}),
				);
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

		// ── Fetch user's document list ──────────────────────────────────────
		let docList: Awaited<ReturnType<typeof listUserDocuments>> = [];
		if (userId) {
			try {
				docList = await listUserDocuments(db, userId);
			} catch {}
		}

		// ── Build system prompt ──────────────────────────────────────────────
		const tz = c.req.header("x-timezone") || "Asia/Shanghai";
		const now = new Date();
		const timeStr = now.toLocaleString("zh-CN", { timeZone: tz });
		let systemPrompt =
			`${getSystemPrompt(persona)}\n\n当前时间：${timeStr}` +
			formatMemoriesForPrompt(retrievedMemories);
		if (docList.length > 0) {
			const readyDocs = docList.filter((d) => d.status === "ready");
			if (readyDocs.length > 0) {
				const activeDocId = c.req.header("x-active-doc") || undefined;
				const docListStr = readyDocs
					.map((d) => {
						const active =
							d.id === activeDocId ? " ← 用户当前激活已打开的就是这个文档" : "";
						return `- ID: ${d.id}  标题:「${d.title}」 分块数：${d.chunks}${active}`;
					})
					.join("\n");
				systemPrompt += `\n\n用户文档库（共 ${readyDocs.length} 份）：\n${docListStr}`;
			}
		}

		// ── Build tools ─────────────────────────────────────────────────────
		// biome-ignore lint/suspicious/noExplicitAny: tool generics incompatible with Record
		let memoryTools: Record<string, any> = {};
		if (userId && c.env.MEM0_API_KEY) {
			memoryTools = createMemoryTool({ env: c.env, userId });
		}

		// biome-ignore lint/suspicious/noExplicitAny: tool generics incompatible with Record
		let exaTools: Record<string, any> = {};
		if (c.env.EXA_API_KEY) {
			exaTools = createExaTools({ env: c.env });
		}

		// biome-ignore lint/suspicious/noExplicitAny: tool generics incompatible with Record
		let docTools: Record<string, any> = {};
		if (userId) {
			try {
				const docIds = docList.map((d) => d.id);
				docTools = createDocTools({
					docIds,
					docList,
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
							(m: WireMessage) => m.role === "user" || m.role === "assistant",
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
				).catch((e) => {
					log.error({
						module: "chat",
						msg: "memory extraction failed",
						error: String(e),
					});
				}),
			);
		}

		// ── Stream chat response ─────────────────────────────────────────────
		const wrappedModel = createModel(c.env);

		let resolveFinish!: () => void;
		const finishPromise = new Promise<void>((r) => {
			resolveFinish = r;
		});

		const uiStream = createUIMessageStream({
			execute: async ({ writer }) => {
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
					tools: {
						...staticTools,
						...hitlTools,
						...exaTools,
						...memoryTools,
						...docTools,
					},
					stopWhen: stepCountIs(5),
					...(isHitlContinuation && {
						providerOptions: {
							openrouter: { reasoning: { effort: "none" } },
						},
					}),
				});

				writer.merge(
					chatResult.toUIMessageStream({
						sendReasoning: true,
						messageMetadata: ({ part }) =>
							part.type === "start" && retrievedMemories.length > 0
								? { mem0: retrievedMemories }
								: undefined,
					}),
				);
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

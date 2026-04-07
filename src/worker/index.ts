import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	Output,
	stepCountIs,
	streamText,
} from "ai";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { DialogueHistoryEntry } from "../shared/dialogue";
import { buildDialogueTurnSchema } from "../shared/dialogue";
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
	createDialogueModel,
	createModel,
	createTitleModel,
	DEFAULT_PERSONA,
	DEFAULT_THREAD_TITLE,
	getPoses,
	getSystemPrompt,
	PERSONAS,
	resolvePersona,
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
	if (body.persona) {
		const resolved = resolvePersona(body.persona);
		await updateThreadPersona(db, threadId, userId, resolved);
	}
	return c.json({ ok: true });
});

app.get("/api/threads/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const row = await getThread(db, c.req.param("id"));
	if (!row || row.userId !== userId) return c.json({ error: "未找到" }, 404);
	return c.json({ id: row.id, title: row.title, persona: row.persona });
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

// ── Voice messages (persist voice transcripts to thread) ────────────────────
app.post("/api/threads/:id/voice-messages", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const threadId = c.req.param("id");
	const persona = c.req.header("x-persona") || DEFAULT_PERSONA;
	// Ensure thread exists (dialogue mode may enter before any /api/chat call)
	await ensureThread(db, threadId, userId, {
		persona: resolvePersona(persona),
	});

	const { messages: msgs } = await c.req.json<{
		messages: { id: string; role: string; parts: unknown[] }[];
	}>();

	if (msgs?.length) {
		// Check if thread still has default title (for title generation)
		const thread = await getThread(db, threadId);
		const needsTitle = !thread || thread.title === DEFAULT_THREAD_TITLE;

		const now = Math.floor(Date.now() / 1000);
		await saveMessages(
			db,
			msgs.map((m) => ({
				id: m.id,
				threadId,
				role: m.role,
				parts: m.parts,
				createdAt: now,
			})),
		);
		await touchThread(db, threadId, userId);

		// Auto-generate title if thread still has default title
		if (needsTitle) {
			// biome-ignore lint/suspicious/noExplicitAny: wire format
			maybeAutoTitle(c.executionCtx, c.env, db, threadId, userId, msgs as any);
		}
	}

	return c.json({ ok: true });
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

	const { text, voiceId, speed, stability } = await c.req.json<{
		text: string;
		voiceId?: string;
		speed?: number;
		stability?: number;
	}>();
	if (!text?.trim()) return c.json({ error: "text is required" }, 400);

	const voice = voiceId || "JBFqnCBsd6RMkjVDRZzb";
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
				voice_settings: {
					stability: stability ?? 0.5,
					similarity_boost: 0.75,
					speed: speed ?? 1.0,
				},
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
	if (!userId) return c.json({ error: "未授权" }, 401);

	const apiKey = c.env.ELEVENLABS_API_KEY;
	const agentId = c.env.ELEVENLABS_AGENT_ID;
	if (!apiKey || !agentId) return c.json({ error: "语音对话服务未配置" }, 500);

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
	if (!text) return c.json({ title: DEFAULT_THREAD_TITLE });

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

/** Extract user text from wire messages and auto-generate a thread title
 *  if the text is non-empty. Fire-and-forget via waitUntil. */
function maybeAutoTitle(
	ctx: { waitUntil: (p: Promise<unknown>) => void },
	env: Env,
	db: ReturnType<typeof createDb>,
	threadId: string,
	userId: string,
	wireMsgs: { role: string; parts?: { type: string; text?: string }[] }[],
) {
	const firstText = wireMsgs
		.filter((m) => m.role === "user")
		.flatMap((m) =>
			(m.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? ""),
		)
		.filter((t) => !/^\[.*\]$/.test(t.trim()) && !t.startsWith("🎙"))
		.join(" ")
		.trim()
		.slice(0, 200);
	if (!firstText) return;
	ctx.waitUntil(
		generateLLMTitle(
			env,
			`为以下用户消息生成简洁中文标题，4-8个字，无标点无引号，只回复标题：\n${firstText}`,
		)
			.then(async (title) => {
				if (title) await updateThreadTitle(db, threadId, userId, title);
			})
			.catch(() => {}),
	);
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

/**
 * Strip unresolved HITL tool calls from messages to prevent
 * "Tool result is missing" errors from the LLM.
 *
 * assistant-ui tool part format:
 *   - Non-HITL (execute): { type: "tool-xxx", state: "output-available", output: {...} }
 *   - HITL answered:      { type: "tool-xxx", state: "result", result: {...} }
 *   - HITL unanswered:    { type: "tool-xxx", state: "input-available", input: {...} }
 *
 * We strip only tool parts that are HITL AND unanswered (state === "input-available").
 */
function stripUnresolvedToolCalls(messages: WireMessage[]): WireMessage[] {
	return messages.map((msg) => {
		if (msg.role !== "assistant" || !Array.isArray(msg.parts)) return msg;
		const filtered = msg.parts.filter(
			// biome-ignore lint/suspicious/noExplicitAny: wire format
			(part: any) => {
				if (!part.type?.startsWith("tool-")) return true;
				// Keep if resolved: has output (non-HITL) or result (HITL answered)
				if (part.output != null || part.result != null) return true;
				// Keep if state is not "input-available" (e.g. streaming, partial)
				if (part.state !== "input-available") return true;
				return false;
			},
		);
		if (filtered.length === msg.parts.length) return msg;
		return { ...msg, parts: filtered };
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
		const persona = resolvePersona(personaRaw);
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

		// ── Upsert assistant messages with tool results (so HITL results persist) ──
		if (threadId && userId) {
			try {
				// Upsert any assistant messages whose tool parts have been resolved
				// (HITL: result field set; non-HITL: output field set)
				const assistantWithResults = messages.filter(
					(m: WireMessage) =>
						m.role === "assistant" &&
						Array.isArray(m.parts) &&
						m.parts.some(
							// biome-ignore lint/suspicious/noExplicitAny: wire format
							(p: any) =>
								p.type?.startsWith("tool-") &&
								(p.result != null || p.output != null),
						),
				);
				if (assistantWithResults.length > 0) {
					const now = Math.floor(Date.now() / 1000);
					await saveMessages(
						db,
						assistantWithResults.map((m: WireMessage) => ({
							id: m.id,
							threadId,
							role: "assistant",
							parts: m.parts as unknown[],
							createdAt: now,
						})),
					);
				}
			} catch (e) {
				log.error({
					module: "chat",
					msg: "upsert tool results failed",
					error: String(e),
				});
			}
		}

		// ── Auto-generate title on first message (fire-and-forget) ──────────
		const userMessages = messages.filter((m: WireMessage) => m.role === "user");
		if (threadId && userId && userMessages.length === 1) {
			maybeAutoTitle(
				c.executionCtx,
				c.env,
				db,
				threadId,
				userId,
				userMessages as {
					role: string;
					parts?: { type: string; text?: string }[];
				}[],
			);
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
		const autoTTS = c.req.header("x-auto-tts") === "1";
		let systemPrompt =
			`${getSystemPrompt(persona)}\n\n当前时间：${timeStr}` +
			formatMemoriesForPrompt(retrievedMemories);
		if (autoTTS) {
			systemPrompt +=
				"\n\n⚠️ 用户已开启自动朗读模式。你的最终输出应尽可能使用纯文本，避免 markdown 格式（如加粗、列表、代码块等），因为这些格式朗读效果不佳。用自然的口语化表达，适当分段即可。";
		}
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
			const memMsgs = messages
				.filter((m: WireMessage) => m.role === "user" || m.role === "assistant")
				.slice(-6)
				.map((m: WireMessage) => ({
					role: m.role as string,
					content:
						m.parts
							?.filter((p: { type: string }) => p.type === "text")
							.map((p: { text?: string }) => p.text ?? "")
							.join(" ")
							.trim() ?? "",
				}))
				.filter((m) => m.content.length > 0);
			if (memMsgs.length > 0) {
				c.executionCtx.waitUntil(
					addMemories(c.env, memMsgs, userId).catch((e) => {
						log.error({
							module: "chat",
							msg: "memory extraction failed",
							error: String(e),
						});
					}),
				);
			}
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
					stripUnresolvedToolCalls(resolveDataUrls(messages)) as any,
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
						// Only save TRULY NEW messages (not already in input).
						// Existing messages get their tool results updated via
						// the upsert logic earlier in the request.
						const inputIds = new Set(
							messages.map((m: WireMessage) => m.id).filter(Boolean),
						);
						const newMsgs = finishedMessages.filter(
							(m) => m.role !== "user" && !inputIds.has(m.id),
						);
						if (newMsgs.length > 0) {
							const now = Math.floor(Date.now() / 1000);
							await saveMessages(
								db,
								newMsgs.map((m) => ({
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

// ── Dialogue Mode (streaming structured output, no tools) ───────────────────

/** Returns available poses for a persona (used by frontend). */
app.get("/api/dialogue/poses/:persona", (c) => {
	const persona = resolvePersona(c.req.param("persona"));
	return c.json(getPoses(persona));
});

app.post("/api/dialogue", async (c) => {
	try {
		const userId = await requireUserId(c);
		if (!userId) return c.json({ error: "未授权" }, 401);

		const body = await c.req.json<Record<string, unknown>>();
		log.info({
			module: "dialogue",
			msg: "request",
			hasActiveDocId: !!body.activeDocId,
			hasChatSummary: !!body.chatSummary,
			personaRaw: body.persona,
		});
		const history = (body.history ?? []) as DialogueHistoryEntry[];
		const personaRaw = (body.persona ?? DEFAULT_PERSONA) as string;
		const activeDocId = body.activeDocId as string | undefined;
		const chatSummary = body.chatSummary as string | undefined;

		const persona = resolvePersona(personaRaw);
		const p = PERSONAS[persona];
		const poses = getPoses(persona);

		// Build dynamic schema with persona-specific poses
		const schema = buildDialogueTurnSchema(poses as [string, ...string[]]);

		// Fetch active document content for context injection
		let docContext = "";
		if (activeDocId && userId) {
			try {
				const db = createDb(c.env.DB);
				log.info({
					module: "dialogue",
					msg: "fetching doc",
					activeDocId,
					userId,
				});
				const md = await getDocumentMarkdown(activeDocId, {
					db,
					r2: c.env.R2,
					userId,
				});
				log.info({
					module: "dialogue",
					msg: "doc result",
					hasContent: !!md,
					length: md?.length ?? 0,
				});
				if (md) {
					const truncated = md.slice(0, 12000);
					docContext = `\n\n# 正在阅读的文档\n\n${truncated}`;
				}
			} catch (e) {
				log.error({
					module: "dialogue",
					msg: "doc fetch error",
					error: String(e),
				});
			}
		}

		// Build dialogue system prompt
		const tz = c.req.header("x-timezone") || "Asia/Shanghai";
		const timeStr = new Date().toLocaleString("zh-CN", { timeZone: tz });

		let systemPrompt = `${p.prompt}

当前时间：${timeStr}

# 剧情对话模式规则
- 你正在与用户进行角色扮演式的剧情对话
- 你的回复必须严格按照指定的 JSON 结构输出
- speech 字段必须是纯文本，禁止使用任何 markdown 格式
- pose 字段必须从以下选项中选择最贴切的姿态：${poses.join("、")}
- choices 字段必须提供 1-3 个用户可能的回复选项，用第一人称口语化短句，像 RPG 对话选项；鼓励在选项开头使用 emoji 增加趣味
- 保持角色一致性，每句话都要符合你的人设
- preEffect / postEffect 是视觉特效，用于增强对话的戏剧性和趣味性。可选值：confetti（庆祝）、fireworks（烟花）、stars（星星）、hearts（爱心）、school-pride（双侧彩炮）、flash（闪光）、screen-shake（震动）、bomb（炸弹爆炸）、explosions（密集爆炸）、lightning（闪电）、vortex（漩涡）、glitch（故障）、rain（阴云下雨）、good-job（彩色文字庆祝）、panel-shake（对话框抖动）。积极使用这些特效来配合对话情绪和剧情节奏，不要吝啬使用`;

		if (docContext) systemPrompt += docContext;
		if (chatSummary)
			systemPrompt += `\n\n# 之前的文字对话记录（供参考）\n${chatSummary}`;

		log.info({
			module: "dialogue",
			msg: "prompt built",
			promptLength: systemPrompt.length,
			hasDocContext: !!docContext,
			hasChatSummary: !!chatSummary,
			historyLength: history.length,
		});

		const messages = history.map((entry) => ({
			role: entry.role as "user" | "assistant",
			content: entry.speech,
		}));

		const model = createDialogueModel(c.env);
		const result = streamText({
			model,
			output: Output.object({ schema }),
			system: systemPrompt,
			messages,
		});

		return result.toTextStreamResponse();
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : "未知错误";
		log.error({ module: "dialogue", msg });
		return c.json({ error: msg }, 500);
	}
});

export default app;

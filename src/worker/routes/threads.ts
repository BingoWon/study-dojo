import { Hono } from "hono";
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
} from "../db";
import {
	DEFAULT_PERSONA,
	DEFAULT_THREAD_TITLE,
	PERSONAS,
	resolvePersona,
} from "../model";
import { generateLLMTitle, maybeAutoTitle, requireUserId } from "./helpers";

const threads = new Hono<{ Bindings: Env }>();

threads.get("/", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	return c.json(await getThreadsByUserId(db, userId));
});

threads.patch("/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const body = await c.req.json<{ title?: string; persona?: string }>();
	const db = createDb(c.env.DB);
	const threadId = c.req.param("id");
	if (body.title) await updateThreadTitle(db, threadId, userId, body.title);
	if (body.persona) {
		const resolved = resolvePersona(body.persona);
		await updateThreadPersona(db, threadId, userId, resolved);
	}
	return c.json({ ok: true });
});

threads.get("/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const row = await getThread(db, c.req.param("id"));
	if (!row || row.userId !== userId) return c.json({ error: "未找到" }, 404);
	return c.json({ id: row.id, title: row.title, persona: row.persona });
});

threads.delete("/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	await deleteThread(db, c.req.param("id"), userId);
	return c.json({ ok: true });
});

threads.get("/:id/messages", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const thread = await getThread(db, c.req.param("id"));
	if (!thread || thread.userId !== userId) return c.json([], 200);
	const rows = await getMessagesByThreadId(db, c.req.param("id"));
	return c.json(rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts })));
});

threads.post("/:id/voice-messages", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const threadId = c.req.param("id");
	const persona = c.req.header("x-persona") || DEFAULT_PERSONA;
	const docTitle = c.req.header("x-doc-title") || undefined;
	const mode = c.req.header("x-mode") || undefined;
	const resolvedPersona = resolvePersona(persona);
	await ensureThread(db, threadId, userId, {
		persona: resolvedPersona,
	});

	const { messages: msgs } = await c.req.json<{
		messages: { id: string; role: string; parts: unknown[] }[];
	}>();

	if (msgs?.length) {
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

		if (needsTitle) {
			// biome-ignore lint/suspicious/noExplicitAny: wire format
			maybeAutoTitle(c.executionCtx, c.env, db, threadId, userId, msgs as any, {
				persona: PERSONAS[resolvedPersona]?.name,
				docTitle: docTitle || undefined,
				mode:
					mode === "dialogue"
						? "剧情伴读"
						: mode === "voice"
							? "语音伴读"
							: undefined,
			});
		}
	}

	return c.json({ ok: true });
});

threads.post("/:id/generate-title", async (c) => {
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
		if (title) await updateThreadTitle(db, threadId, userId, title);
		return c.json({ title: title || text.slice(0, 50) });
	} catch {
		return c.json({ title: text.slice(0, 50) });
	}
});

export default threads;

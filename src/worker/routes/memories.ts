import { Hono } from "hono";
import { addMemories, deleteMemory, listMemories } from "../memory";
import { requireUserId } from "./helpers";

const memories = new Hono<{ Bindings: Env }>();

memories.get("/", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	if (!c.env.MEM0_API_KEY) return c.json({ error: "记忆服务未配置" }, 503);
	return c.json(await listMemories(c.env, userId));
});

memories.post("/", async (c) => {
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

memories.delete("/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	if (!c.env.MEM0_API_KEY) return c.json({ ok: true });
	await deleteMemory(c.env, c.req.param("id"));
	return c.json({ ok: true });
});

export default memories;

import { Output, streamText } from "ai";
import { Hono } from "hono";
import type { DialogueHistoryEntry } from "../../shared/dialogue";
import { buildDialogueTurnSchema } from "../../shared/dialogue";
import { createDb } from "../db";
import { log } from "../log";
import {
	createDialogueModel,
	DEFAULT_PERSONA,
	getPoses,
	PERSONAS,
	resolvePersona,
} from "../model";
import { getDocumentMarkdown } from "../rag";
import { requireUserId } from "./helpers";

const dialogue = new Hono<{ Bindings: Env }>();

dialogue.get("/poses/:persona", (c) => {
	const persona = resolvePersona(c.req.param("persona"));
	return c.json(getPoses(persona));
});

dialogue.post("/", async (c) => {
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
		const schema = buildDialogueTurnSchema(poses as [string, ...string[]]);

		// Fetch active document content for context injection
		let docContext = "";
		if (activeDocId && userId) {
			try {
				const db = createDb(c.env.DB);
				const md = await getDocumentMarkdown(activeDocId, {
					db,
					r2: c.env.R2,
					userId,
				});
				if (md) {
					docContext = `\n\n# 正在阅读的文档\n\n${md.slice(0, 12000)}`;
				}
			} catch (e) {
				log.error({
					module: "dialogue",
					msg: "doc fetch error",
					error: String(e),
				});
			}
		}

		// Build system prompt
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
- preEffect / postEffect 是可选的视觉特效，可用于配合对话情绪。可选值：confetti（庆祝）、fireworks（烟花）、stars（星星）、hearts（爱心）、school-pride（双侧彩炮）、flash（闪光）、screen-shake（震动）、bomb（炸弹爆炸）、explosions（密集爆炸）、lightning（闪电）、vortex（漩涡）、glitch（故障）、rain（阴云下雨）、good-job（彩色文字庆祝）、panel-shake（对话框抖动）`;

		if (docContext) systemPrompt += docContext;
		if (chatSummary)
			systemPrompt += `\n\n# 之前的文字对话记录（供参考）\n${chatSummary}`;

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

export default dialogue;

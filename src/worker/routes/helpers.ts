/** Shared helpers for route handlers. */

import { streamText } from "ai";
import { getUserId } from "../auth";
import { type createDb, updateThreadTitle } from "../db";
import { createTitleModel } from "../model";

export async function requireUserId(c: {
	req: { header: (name: string) => string | undefined };
	env: Env;
}) {
	return getUserId(c, c.env);
}

export async function generateLLMTitle(
	env: Env,
	prompt: string,
): Promise<string> {
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
export function maybeAutoTitle(
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

// biome-ignore lint/suspicious/noExplicitAny: UIMessage wire format
export type WireMessage = Record<string, any>;

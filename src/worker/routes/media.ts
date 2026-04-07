/** ElevenLabs routes: scribe token, TTS, voice signed URL. */

import { Hono } from "hono";
import { requireUserId } from "./helpers";

const media = new Hono<{ Bindings: Env }>();

media.post("/scribe-token", async (c) => {
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

media.post("/tts", async (c) => {
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

media.get("/voice-signed-url", async (c) => {
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

export default media;

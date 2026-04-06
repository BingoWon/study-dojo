import type { RealtimeVoiceAdapter } from "@assistant-ui/react";
import { createVoiceSession } from "@assistant-ui/react";
import { VoiceConversation } from "@elevenlabs/client";

export interface VoiceAdapterOptions {
	signedUrlEndpoint: string;
	/** Override system prompt per session */
	systemPrompt?: string;
	/** Override TTS voice per session */
	voiceId?: string;
}

export class ElevenLabsVoiceAdapter implements RealtimeVoiceAdapter {
	private opts: VoiceAdapterOptions;

	constructor(opts: VoiceAdapterOptions) {
		this.opts = opts;
	}

	/** Update options dynamically (e.g. when persona or document changes). */
	configure(patch: Partial<VoiceAdapterOptions>) {
		Object.assign(this.opts, patch);
	}

	connect(connectOpts: { abortSignal?: AbortSignal }) {
		const opts = this.opts;

		return createVoiceSession(connectOpts, async (ctx) => {
			// Fetch signed URL from backend
			const res = await fetch(opts.signedUrlEndpoint);
			if (!res.ok) throw new Error("语音对话连接失败");
			const { signedUrl } = (await res.json()) as { signedUrl: string };

			let volumeInterval: ReturnType<typeof setInterval> | null = null;

			const conversation = await VoiceConversation.startSession({
				signedUrl,
				connectionType: "websocket",
				overrides: {
					agent: opts.systemPrompt
						? { prompt: { prompt: opts.systemPrompt } }
						: undefined,
					tts: opts.voiceId ? { voiceId: opts.voiceId } : undefined,
				},

				onConnect: () => {
					ctx.setStatus({ type: "running" });
					volumeInterval = setInterval(() => {
						ctx.emitVolume(conversation.getInputVolume());
					}, 50);
				},

				onDisconnect: () => {
					if (volumeInterval) clearInterval(volumeInterval);
					ctx.end("finished");
				},

				onError: (error) => {
					console.error("[Voice] Error:", error);
					if (volumeInterval) clearInterval(volumeInterval);
					ctx.end("error", error);
				},

				onModeChange: ({ mode }) => {
					ctx.emitMode(mode === "speaking" ? "speaking" : "listening");
				},

				onMessage: ({ source, message }) => {
					ctx.emitTranscript({
						role: source === "ai" ? "assistant" : "user",
						text: message,
						isFinal: true,
					});
				},
			});

			return {
				disconnect: () => conversation.endSession(),
				mute: () => conversation.setVolume({ volume: 0 }),
				unmute: () => conversation.setVolume({ volume: 1 }),
			};
		});
	}
}

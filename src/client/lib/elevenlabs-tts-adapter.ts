import type { SpeechSynthesisAdapter } from "@assistant-ui/react";

/**
 * ElevenLabs TTS adapter — reads AI messages aloud via the /api/tts proxy.
 * Uses the streaming TTS endpoint for low first-byte latency.
 */
export class ElevenLabsTTSAdapter implements SpeechSynthesisAdapter {
	private endpoint: string;

	constructor(options?: { endpoint?: string }) {
		this.endpoint = options?.endpoint ?? "/api/tts";
	}

	speak(text: string): SpeechSynthesisAdapter.Utterance {
		const subscribers = new Set<() => void>();
		const controller = new AbortController();

		const utterance: SpeechSynthesisAdapter.Utterance = {
			status: { type: "starting" },

			cancel: () => {
				controller.abort();
				utterance.status = { type: "ended", reason: "cancelled" };
				for (const cb of subscribers) cb();
			},

			subscribe: (callback) => {
				if (utterance.status.type === "ended") {
					queueMicrotask(callback);
					return () => {};
				}
				subscribers.add(callback);
				return () => {
					subscribers.delete(callback);
				};
			},
		};

		this.playAudio(text, controller.signal, utterance, subscribers);
		return utterance;
	}

	private async playAudio(
		text: string,
		signal: AbortSignal,
		utterance: SpeechSynthesisAdapter.Utterance,
		subscribers: Set<() => void>,
	) {
		try {
			const res = await fetch(this.endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text }),
				signal,
			});

			if (!res.ok) throw new Error(`TTS failed: ${res.statusText}`);

			const blob = await res.blob();
			if (signal.aborted) return;

			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);

			audio.addEventListener("playing", () => {
				utterance.status = { type: "running" };
				for (const cb of subscribers) cb();
			});

			audio.addEventListener("ended", () => {
				URL.revokeObjectURL(url);
				utterance.status = { type: "ended", reason: "finished" };
				for (const cb of subscribers) cb();
			});

			audio.addEventListener("error", () => {
				URL.revokeObjectURL(url);
				utterance.status = { type: "ended", reason: "error" };
				for (const cb of subscribers) cb();
			});

			signal.addEventListener("abort", () => {
				audio.pause();
				URL.revokeObjectURL(url);
			});

			await audio.play();
		} catch (error) {
			if (signal.aborted) return;
			utterance.status = { type: "ended", reason: "error", error };
			for (const cb of subscribers) cb();
		}
	}
}

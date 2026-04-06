import type { SpeechSynthesisAdapter } from "@assistant-ui/react";

/**
 * Strip markdown syntax so TTS reads clean prose, not "asterisk asterisk bold".
 */
function stripMarkdown(md: string): string {
	return (
		md
			// Code blocks (``` ... ```)
			.replace(/```[\s\S]*?```/g, "")
			// Inline code
			.replace(/`([^`]+)`/g, "$1")
			// Images ![alt](url)
			.replace(/!\[.*?\]\(.*?\)/g, "")
			// Links [text](url) → text
			.replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
			// Headings
			.replace(/^#{1,6}\s+/gm, "")
			// Bold / italic
			.replace(/\*{1,3}(.+?)\*{1,3}/g, "$1")
			.replace(/_{1,3}(.+?)_{1,3}/g, "$1")
			// Strikethrough
			.replace(/~~(.+?)~~/g, "$1")
			// Blockquotes
			.replace(/^>\s+/gm, "")
			// Unordered list bullets
			.replace(/^[-*+]\s+/gm, "")
			// Ordered list numbers
			.replace(/^\d+\.\s+/gm, "")
			// Horizontal rules
			.replace(/^[-*_]{3,}\s*$/gm, "")
			// HTML tags
			.replace(/<[^>]+>/g, "")
			// Collapse multiple blank lines
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}

/**
 * ElevenLabs TTS adapter — reads AI messages aloud via the /api/tts proxy.
 * Strips markdown before synthesis for clean spoken output.
 */
export class ElevenLabsTTSAdapter implements SpeechSynthesisAdapter {
	private endpoint: string;

	constructor(options?: { endpoint?: string }) {
		this.endpoint = options?.endpoint ?? "/api/tts";
	}

	speak(text: string): SpeechSynthesisAdapter.Utterance {
		const subscribers = new Set<() => void>();
		const controller = new AbortController();
		let revoked = false;

		const notify = () => {
			for (const cb of subscribers) cb();
		};

		const utterance: SpeechSynthesisAdapter.Utterance = {
			status: { type: "starting" },

			cancel: () => {
				controller.abort();
				utterance.status = { type: "ended", reason: "cancelled" };
				notify();
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

		this.playAudio(
			stripMarkdown(text),
			controller.signal,
			utterance,
			notify,
			() => revoked,
			() => {
				revoked = true;
			},
		);
		return utterance;
	}

	private async playAudio(
		text: string,
		signal: AbortSignal,
		utterance: SpeechSynthesisAdapter.Utterance,
		notify: () => void,
		isRevoked: () => boolean,
		setRevoked: () => void,
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
			if (signal.aborted || blob.size === 0) return;

			const url = URL.createObjectURL(blob);

			const revokeOnce = () => {
				if (!isRevoked()) {
					setRevoked();
					URL.revokeObjectURL(url);
				}
			};

			const audio = new Audio(url);

			audio.addEventListener("playing", () => {
				utterance.status = { type: "running" };
				notify();
			});

			audio.addEventListener("ended", () => {
				revokeOnce();
				utterance.status = { type: "ended", reason: "finished" };
				notify();
			});

			audio.addEventListener("error", () => {
				revokeOnce();
				utterance.status = { type: "ended", reason: "error" };
				notify();
			});

			signal.addEventListener(
				"abort",
				() => {
					audio.pause();
					revokeOnce();
				},
				{ once: true },
			);

			await audio.play();
		} catch (error) {
			if (signal.aborted) return;
			utterance.status = { type: "ended", reason: "error", error };
			notify();
		}
	}
}

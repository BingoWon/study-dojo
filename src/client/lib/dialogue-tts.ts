/**
 * Dialogue mode TTS player — reuses shared TTS utilities.
 * Extracted from DialogueThread to keep the component focused on UI.
 */

import { ElevenLabsTTSAdapter } from "./elevenlabs-tts-adapter";
import { CHUNK_GAP_MS, fetchTTSBlob, playBlob, SENTENCE_RE } from "./tts-utils";

/** Separate TTS adapter for dialogue mode (intentionally independent from
 *  RuntimeProvider's adapter — each mode manages its own voice lifecycle). */
export const ttsAdapter = new ElevenLabsTTSAdapter({ endpoint: "/api/tts" });

/**
 * Sequential audio player with sentence-level streaming.
 * Feed partial speech text as it arrives from the LLM;
 * complete sentences are fetched immediately, played in order.
 */
export class DialogueTTSPlayer {
	private controller = new AbortController();
	private items: Promise<Blob | null>[] = [];
	private playing = false;
	private spokenLen = 0;

	constructor(private voiceParams: ElevenLabsTTSAdapter["voiceParams"]) {}

	/** Feed growing speech text — sends complete sentences to TTS. */
	feedSpeech(fullSpeech: string) {
		const unspoken = fullSpeech.slice(this.spokenLen);
		if (!unspoken) return;
		const parts = unspoken.split(SENTENCE_RE);
		for (let i = 0; i < parts.length - 1; i++) {
			const sentence = parts[i].trim();
			if (sentence) {
				this.enqueue(sentence);
				this.spokenLen += parts[i].length;
			}
		}
	}

	/** Flush remaining unspoken text (call when speech is complete). */
	flush(fullSpeech: string) {
		const remaining = fullSpeech.slice(this.spokenLen).trim();
		if (remaining) this.enqueue(remaining);
		this.spokenLen = fullSpeech.length;
	}

	abort() {
		this.controller.abort();
		this.items.length = 0;
	}

	private enqueue(text: string) {
		if (this.controller.signal.aborted) return;
		this.items.push(
			fetchTTSBlob(text, this.voiceParams, this.controller.signal),
		);
		if (!this.playing) this.drain();
	}

	private async drain() {
		this.playing = true;
		let isFirst = true;
		const { signal } = this.controller;
		while (this.items.length > 0 && !signal.aborted) {
			const blob = await (this.items.shift() as Promise<Blob | null>);
			if (!blob || blob.size === 0 || signal.aborted) continue;
			if (!isFirst) await new Promise((r) => setTimeout(r, CHUNK_GAP_MS));
			if (signal.aborted) break;
			await playBlob(blob, signal);
			isFirst = false;
		}
		this.playing = false;
	}
}

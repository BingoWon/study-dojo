/**
 * Shared TTS utilities for sentence splitting, fetching, playback,
 * and the unified StreamingTTSPlayer used by both text and dialogue modes.
 *
 * See docs/tts-architecture.md for full design documentation.
 */

// ── Constants ────────────────────────────────────────────────────────────

/** Splits on Chinese/English sentence-ending punctuation and newlines. */
export const SENTENCE_RE = /(?<=[。！？.!?\n])/;

/** Inter-chunk pause (ms) for natural pacing between audio segments. */
export const CHUNK_GAP_MS = 300;

/** First chunk threshold (chars). Lower = faster time-to-first-audio. */
const FIRST_CHUNK_CHARS = 30;

/** Subsequent chunk threshold (chars). Higher = more natural phrasing. */
const NEXT_CHUNK_CHARS = 100;

// ── Manual speak: split complete text into chunks ────────────────────────

/** Split text into chunks at sentence boundaries.
 *  Accumulates sentences until buffer reaches minChars, then cuts. */
export function splitIntoChunks(text: string, minChars = 60): string[] {
	const sentences = text.split(SENTENCE_RE).filter((s) => s.trim());
	if (sentences.length === 0) return [];

	const chunks: string[] = [];
	let buf = "";
	for (const s of sentences) {
		buf += s;
		if (buf.length >= minChars) {
			chunks.push(buf);
			buf = "";
		}
	}
	if (buf.trim()) {
		if (chunks.length > 0 && buf.trim().length < minChars / 2) {
			chunks[chunks.length - 1] += buf;
		} else {
			chunks.push(buf);
		}
	}
	return chunks;
}

/** Strip markdown syntax so TTS reads clean prose. */
export function stripMarkdown(md: string): string {
	return md
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!\[.*?\]\(.*?\)/g, "")
		.replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/\*{1,3}(.+?)\*{1,3}/g, "$1")
		.replace(/_{1,3}(.+?)_{1,3}/g, "$1")
		.replace(/~~(.+?)~~/g, "$1")
		.replace(/^>\s+/gm, "")
		.replace(/^[-*+]\s+/gm, "")
		.replace(/^\d+\.\s+/gm, "")
		.replace(/^[-*_]{3,}\s*$/gm, "")
		.replace(/<[^>]+>/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

// ── Fetch & Playback ────────────────────────────────────────────────────

export interface TTSVoiceParams {
	endpoint: string;
	voiceId?: string;
	speed?: number;
	stability?: number;
}

/** Fetch a TTS audio blob (does NOT play it). */
export function fetchTTSBlob(
	text: string,
	params: TTSVoiceParams,
	signal?: AbortSignal,
): Promise<Blob | null> {
	return fetch(params.endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			text,
			voiceId: params.voiceId,
			speed: params.speed,
			stability: params.stability,
		}),
		signal,
	})
		.then((r) => (r.ok ? r.blob() : null))
		.catch(() => null);
}

/** Play a single audio Blob. Resolves when playback ends or is aborted. */
export function playBlob(blob: Blob, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(blob);
		const audio = new Audio(url);
		const cleanup = () => {
			URL.revokeObjectURL(url);
			resolve();
		};
		audio.addEventListener("ended", cleanup);
		audio.addEventListener("error", cleanup);
		signal.addEventListener(
			"abort",
			() => {
				audio.pause();
				cleanup();
			},
			{ once: true },
		);
		audio.play().catch(cleanup);
	});
}

// ── Unified Streaming TTS Player ────────────────────────────────────────
//
// Used by BOTH text mode (AutoSpeakWatcher) and dialogue mode.
// Single source of truth for all streaming auto-read logic.
//
// Algorithm:
//   1. First chunk: accumulate to FIRST_CHUNK_CHARS (30), then cut at the
//      last sentence boundary before that point. If no boundary exists yet,
//      wait until the first sentence boundary appears, then send immediately.
//   2. Subsequent chunks: accumulate to NEXT_CHUNK_CHARS (100), same
//      boundary logic. BUT if the first chunk's audio result has arrived
//      (about to start playing), immediately send whatever is buffered up
//      to the last sentence boundary — don't wait for 100 chars.
//   3. Flush: when LLM output ends, send everything remaining.

/** Find the last sentence boundary position in text. Returns -1 if none. */
function lastSentenceBoundary(text: string): number {
	for (let i = text.length - 1; i >= 0; i--) {
		if (/[。！？.!?\n]/.test(text[i])) return i + 1;
	}
	return -1;
}

export class StreamingTTSPlayer {
	private abortCtrl = new AbortController();
	private items: Promise<Blob | null>[] = [];
	private playing = false;
	private consumed = 0;
	private buffer = "";
	private firstSent = false;
	private firstResultReady = false;

	/** Optional callback when queue drains (used by text mode proxy bridge). */
	onIdle?: () => void;

	constructor(private voiceParams: TTSVoiceParams) {}

	/** Feed growing full text from LLM streaming. */
	feedText(fullText: string) {
		const newText = fullText.slice(this.consumed);
		if (!newText) return;
		this.buffer += newText;
		this.consumed = fullText.length;
		this.tryEmit(false);
	}

	/** Flush all remaining text (call when LLM output is complete). */
	flush(fullText: string) {
		const remaining = fullText.slice(this.consumed);
		if (remaining) this.buffer += remaining;
		this.consumed = fullText.length;
		this.tryEmit(true);
	}

	abort() {
		this.abortCtrl.abort();
		this.items.length = 0;
		this.buffer = "";
		this.consumed = 0;
		this.firstSent = false;
		this.firstResultReady = false;
	}

	private tryEmit(force: boolean) {
		const text = this.buffer;
		if (!text.trim() && !force) return;

		const threshold = this.firstSent ? NEXT_CHUNK_CHARS : FIRST_CHUNK_CHARS;
		const shouldSend =
			force || text.length >= threshold || this.firstResultReady;

		if (!shouldSend) return;

		// Find the last sentence boundary to cut at
		const boundary = lastSentenceBoundary(text);

		if (force) {
			// Flush: send everything
			if (text.trim()) {
				this.buffer = "";
				this.enqueue(text.trim());
			}
		} else if (boundary > 0) {
			// Cut at last sentence boundary
			const chunk = text.slice(0, boundary).trim();
			this.buffer = text.slice(boundary);
			if (chunk) {
				if (!this.firstSent) this.firstSent = true;
				if (this.firstResultReady) this.firstResultReady = false;
				this.enqueue(chunk);
			}
		} else if (text.length >= threshold) {
			// No sentence boundary but over threshold — keep waiting for one
			// (don't send mid-sentence)
		}
	}

	private enqueue(text: string) {
		if (this.abortCtrl.signal.aborted) return;

		const isFirstItem = this.items.length === 0 && !this.playing;
		const blobPromise = fetchTTSBlob(
			text,
			this.voiceParams,
			this.abortCtrl.signal,
		);

		// When first fetch resolves, trigger immediate send of buffered content
		if (isFirstItem || !this.firstSent) {
			blobPromise.then(() => {
				if (!this.abortCtrl.signal.aborted && !this.firstResultReady) {
					this.firstResultReady = true;
					this.tryEmit(false);
				}
			});
		}

		this.items.push(blobPromise);
		if (!this.playing) this.drain();
	}

	private async drain() {
		this.playing = true;
		let isFirst = true;
		const { signal } = this.abortCtrl;
		while (this.items.length > 0 && !signal.aborted) {
			const blob = await (this.items.shift() as Promise<Blob | null>);
			if (!blob || blob.size === 0 || signal.aborted) continue;
			if (!isFirst) await new Promise((r) => setTimeout(r, CHUNK_GAP_MS));
			if (signal.aborted) break;
			await playBlob(blob, signal);
			isFirst = false;
		}
		this.playing = false;
		if (!signal.aborted) this.onIdle?.();
	}
}

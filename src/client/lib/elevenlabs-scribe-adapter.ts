import type { DictationAdapter } from "@assistant-ui/react";
import { RealtimeEvents, Scribe } from "@elevenlabs/client";
import * as OpenCC from "opencc-js";

/**
 * ElevenLabs Scribe v2 Realtime — speech-to-text dictation adapter.
 *
 * ElevenLabs does not distinguish Simplified/Traditional Chinese. When
 * `toSimplified` is enabled, transcripts are post-processed with OpenCC
 * (word-level T→S conversion, not naïve char substitution).
 */

let t2sConverter: (text: string) => string;
function getT2SConverter() {
	if (!t2sConverter) {
		t2sConverter = OpenCC.ConverterFactory(
			OpenCC.Locale.from.tw,
			OpenCC.Locale.to.cn,
		);
	}
	return t2sConverter;
}

export class ElevenLabsScribeAdapter implements DictationAdapter {
	private tokenEndpoint: string;
	private languageCode: string | undefined;
	private convertToSimplified: boolean;
	public disableInputDuringDictation: boolean;

	constructor(options: {
		tokenEndpoint: string;
		languageCode?: string;
		/** Convert Traditional Chinese → Simplified via OpenCC. @default false */
		toSimplified?: boolean;
		disableInputDuringDictation?: boolean;
	}) {
		this.tokenEndpoint = options.tokenEndpoint;
		this.languageCode = options.languageCode;
		this.convertToSimplified = options.toSimplified ?? false;
		this.disableInputDuringDictation =
			options.disableInputDuringDictation ?? true;
	}

	private postProcess(text: string): string {
		if (!this.convertToSimplified) return text;
		return getT2SConverter()(text);
	}

	listen(): DictationAdapter.Session {
		const callbacks = {
			start: new Set<() => void>(),
			end: new Set<(r: DictationAdapter.Result) => void>(),
			speech: new Set<(r: DictationAdapter.Result) => void>(),
		};

		// Mutable state — the session object exposes it via property descriptor
		let status: DictationAdapter.Status = { type: "starting" };
		let connection: ReturnType<typeof Scribe.connect> | null = null;
		const transcriptParts: string[] = [];

		const setStatus = (s: DictationAdapter.Status) => {
			status = s;
		};

		const session: DictationAdapter.Session = {
			get status() {
				return status;
			},

			stop: async () => {
				if (connection) {
					connection.commit();
					await new Promise((r) => setTimeout(r, 500));
					connection.close();
					connection = null;
				}
				setStatus({ type: "ended", reason: "stopped" });
				const full = transcriptParts.join(" ").trim();
				if (full) {
					for (const cb of callbacks.end) cb({ transcript: full });
				}
			},

			cancel: () => {
				if (connection) {
					connection.close();
					connection = null;
				}
				setStatus({ type: "ended", reason: "cancelled" });
			},

			onSpeechStart: (cb) => {
				callbacks.start.add(cb);
				return () => {
					callbacks.start.delete(cb);
				};
			},
			onSpeechEnd: (cb) => {
				callbacks.end.add(cb);
				return () => {
					callbacks.end.delete(cb);
				};
			},
			onSpeech: (cb) => {
				callbacks.speech.add(cb);
				return () => {
					callbacks.speech.delete(cb);
				};
			},
		};

		this.connect(callbacks, transcriptParts, setStatus, () => status, {
			setConnection: (c) => {
				connection = c;
			},
		});

		return session;
	}

	private async connect(
		callbacks: {
			start: Set<() => void>;
			end: Set<(r: DictationAdapter.Result) => void>;
			speech: Set<(r: DictationAdapter.Result) => void>;
		},
		transcriptParts: string[],
		setStatus: (s: DictationAdapter.Status) => void,
		getStatus: () => DictationAdapter.Status,
		refs: {
			setConnection: (c: ReturnType<typeof Scribe.connect>) => void;
		},
	) {
		try {
			const tokenRes = await fetch(this.tokenEndpoint, { method: "POST" });
			if (!tokenRes.ok)
				throw new Error(`Token fetch failed: ${tokenRes.statusText}`);
			const { token } = (await tokenRes.json()) as { token: string };

			if (getStatus().type === "ended") return;

			const connection = Scribe.connect({
				token,
				modelId: "scribe_v2_realtime",
				...(this.languageCode ? { languageCode: this.languageCode } : {}),
				microphone: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});
			refs.setConnection(connection);

			connection.on(RealtimeEvents.SESSION_STARTED, () => {
				setStatus({ type: "running" });
				for (const cb of callbacks.start) cb();
			});

			connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
				if (data.text) {
					const text = this.postProcess(data.text);
					for (const cb of callbacks.speech)
						cb({ transcript: text, isFinal: false });
				}
			});

			connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
				if (data.text?.trim()) {
					const text = this.postProcess(data.text);
					transcriptParts.push(text);
					for (const cb of callbacks.speech)
						cb({ transcript: text, isFinal: true });
				}
			});

			connection.on(RealtimeEvents.CLOSE, () => {
				if (getStatus().type !== "ended") {
					setStatus({ type: "ended", reason: "stopped" });
				}
				const full = transcriptParts.join(" ").trim();
				if (full) {
					for (const cb of callbacks.end) cb({ transcript: full });
				}
			});

			connection.on(RealtimeEvents.ERROR, (error) => {
				console.error("[Scribe] Error:", error);
				setStatus({ type: "ended", reason: "error" });
			});

			connection.on(RealtimeEvents.AUTH_ERROR, (data) => {
				console.error("[Scribe] Auth error:", data.error);
				setStatus({ type: "ended", reason: "error" });
			});
		} catch (error) {
			console.error("[Scribe] Connection failed:", error);
			setStatus({ type: "ended", reason: "error" });
		}
	}
}

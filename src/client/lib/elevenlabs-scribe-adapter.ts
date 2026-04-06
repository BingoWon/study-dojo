import type { DictationAdapter } from "@assistant-ui/react";
import { RealtimeEvents, Scribe } from "@elevenlabs/client";

/**
 * ElevenLabs Scribe v2 Realtime — speech-to-text dictation adapter.
 * Transcribes user speech into the composer input in real time (~150ms latency).
 */
export class ElevenLabsScribeAdapter implements DictationAdapter {
	private tokenEndpoint: string;
	private languageCode: string;
	public disableInputDuringDictation: boolean;

	constructor(options: {
		tokenEndpoint: string;
		languageCode?: string;
		disableInputDuringDictation?: boolean;
	}) {
		this.tokenEndpoint = options.tokenEndpoint;
		this.languageCode = options.languageCode ?? "en";
		this.disableInputDuringDictation =
			options.disableInputDuringDictation ?? true;
	}

	listen(): DictationAdapter.Session {
		const callbacks = {
			start: new Set<() => void>(),
			end: new Set<(r: DictationAdapter.Result) => void>(),
			speech: new Set<(r: DictationAdapter.Result) => void>(),
		};

		let connection: ReturnType<typeof Scribe.connect> | null = null;
		let fullTranscript = "";

		const session: DictationAdapter.Session = {
			status: { type: "starting" },

			stop: async () => {
				if (connection) {
					connection.commit();
					await new Promise((r) => setTimeout(r, 500));
					connection.close();
					connection = null;
				}
				(session as { status: DictationAdapter.Status }).status = {
					type: "ended",
					reason: "stopped",
				};
				if (fullTranscript) {
					for (const cb of callbacks.end) cb({ transcript: fullTranscript });
				}
			},

			cancel: () => {
				if (connection) {
					connection.close();
					connection = null;
				}
				(session as { status: DictationAdapter.Status }).status = {
					type: "ended",
					reason: "cancelled",
				};
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

		this.connect(session, callbacks, {
			setConnection: (c) => {
				connection = c;
			},
			getFullTranscript: () => fullTranscript,
			setFullTranscript: (t) => {
				fullTranscript = t;
			},
		});

		return session;
	}

	private async connect(
		session: DictationAdapter.Session,
		callbacks: {
			start: Set<() => void>;
			end: Set<(r: DictationAdapter.Result) => void>;
			speech: Set<(r: DictationAdapter.Result) => void>;
		},
		refs: {
			setConnection: (c: ReturnType<typeof Scribe.connect>) => void;
			getFullTranscript: () => string;
			setFullTranscript: (t: string) => void;
		},
	) {
		try {
			const tokenRes = await fetch(this.tokenEndpoint, { method: "POST" });
			if (!tokenRes.ok)
				throw new Error(`Token fetch failed: ${tokenRes.statusText}`);
			const { token } = (await tokenRes.json()) as { token: string };

			const currentStatus = (session as { status: DictationAdapter.Status })
				.status;
			if (currentStatus.type === "ended") return;

			const connection = Scribe.connect({
				token,
				modelId: "scribe_v2_realtime",
				languageCode: this.languageCode,
				microphone: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});
			refs.setConnection(connection);

			connection.on(RealtimeEvents.SESSION_STARTED, () => {
				(session as { status: DictationAdapter.Status }).status = {
					type: "running",
				};
				for (const cb of callbacks.start) cb();
			});

			connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
				if (data.text) {
					for (const cb of callbacks.speech)
						cb({ transcript: data.text, isFinal: false });
				}
			});

			connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
				if (data.text?.trim()) {
					refs.setFullTranscript(`${refs.getFullTranscript()}${data.text} `);
					for (const cb of callbacks.speech)
						cb({ transcript: data.text, isFinal: true });
				}
			});

			connection.on(RealtimeEvents.CLOSE, () => {
				const s = (session as { status: DictationAdapter.Status }).status;
				if (s.type !== "ended") {
					(session as { status: DictationAdapter.Status }).status = {
						type: "ended",
						reason: "stopped",
					};
				}
				const transcript = refs.getFullTranscript().trim();
				if (transcript) {
					for (const cb of callbacks.end) cb({ transcript });
				}
			});

			connection.on(RealtimeEvents.ERROR, (error) => {
				console.error("[Scribe] Error:", error);
				(session as { status: DictationAdapter.Status }).status = {
					type: "ended",
					reason: "error",
				};
			});

			connection.on(RealtimeEvents.AUTH_ERROR, (data) => {
				console.error("[Scribe] Auth error:", data.error);
				(session as { status: DictationAdapter.Status }).status = {
					type: "ended",
					reason: "error",
				};
			});
		} catch (error) {
			console.error("[Scribe] Connection failed:", error);
			(session as { status: DictationAdapter.Status }).status = {
				type: "ended",
				reason: "error",
			};
		}
	}
}

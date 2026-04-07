import { type UIMessage, useChat } from "@ai-sdk/react";
import type { AttachmentAdapter } from "@assistant-ui/react";
import {
	AssistantRuntimeProvider,
	type RemoteThreadListAdapter,
	RuntimeAdapterProvider,
	useAui,
	useAuiState,
	useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { createAssistantStream } from "assistant-stream";
import {
	createContext,
	type FC,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	DEFAULT_PERSONA,
	PERSONAS,
	type PersonaId,
	resolvePersona,
} from "../worker/model";
import { AcademicSearchToolUI } from "./components/tools/AcademicSearchToolUI";
import { AskUserToolUI } from "./components/tools/AskUserToolUI";
import {
	DocSearchToolUI,
	DocSuggestToolUI,
} from "./components/tools/DocSearchToolUI";
import { HighlightDocToolUI } from "./components/tools/HighlightDocToolUI";
import { OpenDocToolUI } from "./components/tools/OpenDocToolUI";
import { ReadDocToolUI } from "./components/tools/ReadDocToolUI";
import { RecipeToolUI } from "./components/tools/RecipeToolUI";
import { SaveMemoryToolUI } from "./components/tools/SaveMemoryToolUI";
import { SearchToolUI } from "./components/tools/SearchToolUI";
import { ElevenLabsScribeAdapter } from "./lib/elevenlabs-scribe-adapter";
import { ElevenLabsTTSAdapter } from "./lib/elevenlabs-tts-adapter";
import type { VoiceTranscript } from "./lib/elevenlabs-voice-adapter";
import {
	CHUNK_GAP_MS,
	fetchTTSBlob,
	playBlob,
	SENTENCE_RE,
} from "./lib/tts-utils";

// ── Persona Context (per-thread persona, set at thread creation) ──────────

const PersonaCtx = createContext<{
	persona: PersonaId;
	setPersona: (id: PersonaId) => void;
}>({ persona: DEFAULT_PERSONA, setPersona: () => {} });

export const usePersona = () => useContext(PersonaCtx);

// ── Auto-TTS Context (persisted per-browser in localStorage) ──────────────

const AutoTTSCtx = createContext<{
	autoTTS: boolean;
	setAutoTTS: (v: boolean) => void;
}>({ autoTTS: true, setAutoTTS: () => {} });

export const useAutoTTS = () => useContext(AutoTTSCtx);

// ── Voice Mode Context ────────────────────────────────────────────────────

export interface VoiceModeState {
	active: boolean;
	docId: string | null;
	docTitle: string | null;
	systemPrompt: string | null;
}

const VoiceModeCtx = createContext<{
	voiceMode: VoiceModeState;
	enterVoiceMode: (docId: string, docTitle: string) => void;
	exitVoiceMode: (voiceMessages?: VoiceTranscript[]) => void;
}>({
	voiceMode: { active: false, docId: null, docTitle: null, systemPrompt: null },
	enterVoiceMode: () => {},
	exitVoiceMode: () => {},
});

export const useVoiceMode = () => useContext(VoiceModeCtx);

// ── Dialogue Mode Context ────────────────────────────────────────────────

export interface DialogueModeState {
	active: boolean;
}

const DialogueModeCtx = createContext<{
	dialogueMode: DialogueModeState;
	enterDialogueMode: () => void;
	exitDialogueMode: () => void;
}>({
	dialogueMode: { active: false },
	enterDialogueMode: () => {},
	exitDialogueMode: () => {},
});

export const useDialogueMode = () => useContext(DialogueModeCtx);

// ── ElevenLabs Adapters (stable module-scope instances) ─────────────────────

const scribeAdapter = new ElevenLabsScribeAdapter({
	tokenEndpoint: "/api/scribe-token",
	languageCode: "zh",
	toSimplified: true, // convert Traditional → Simplified Chinese
});

const ttsAdapter = new ElevenLabsTTSAdapter({ endpoint: "/api/tts" });

const runtimeAdapters = {
	dictation: scribeAdapter,
	speech: ttsAdapter,
};

/** Voice messages pending merge into text chat. Module-level to bridge
 *  between RuntimeProvider (writer) and useMyRuntime (reader). */
let pendingVoiceMsgs: VoiceTranscript[] | null = null;

/** Module-level autoTTS flag readable by transport headers. */
let autoTTSFlag = true;

// ── Attachment Adapter ──────────────────────────────────────────────────────

const readAsDataURL = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result as string);
		r.onerror = reject;
		r.readAsDataURL(file);
	});

const attachmentAdapter: AttachmentAdapter = {
	accept: "image/*,application/pdf,video/*,audio/*",
	async add({ file }) {
		return {
			id: file.name,
			type: file.type.startsWith("image/") ? "image" : "document",
			name: file.name,
			contentType: file.type,
			file,
			status: { type: "requires-action", reason: "composer-send" },
		};
	},
	async send(attachment) {
		const { file } = attachment;
		const url = await readAsDataURL(file);
		if (file.type.startsWith("image/")) {
			return {
				...attachment,
				status: { type: "complete" },
				content: [{ type: "image", image: url }],
			};
		}
		return {
			...attachment,
			status: { type: "complete" },
			content: [{ type: "file", data: url, mimeType: file.type }],
		};
	},
	async remove() {},
};

// ── Thread List Adapter (backed by /api/threads) ────────────────────────────

// ── Thread persona mapping (remoteId → persona) ──────────────────────────

const threadPersonaMap = new Map<string, PersonaId>();

/** Update cached persona for a thread (called when user switches persona). */
export function setThreadPersona(remoteId: string, persona: PersonaId) {
	threadPersonaMap.set(remoteId, persona);
}

const threadListAdapter: RemoteThreadListAdapter = {
	async list() {
		const res = await fetch("/api/threads");
		if (!res.ok) return { threads: [] };
		const threads = (await res.json()) as {
			id: string;
			title: string;
			persona: string;
		}[];
		for (const t of threads) {
			threadPersonaMap.set(t.id, resolvePersona(t.persona ?? "raiden"));
		}
		return {
			threads: threads.map((t) => ({
				remoteId: t.id,
				status: "regular" as const,
				title: t.title,
			})),
		};
	},

	async initialize() {
		// Generate a proper UUID as remoteId (server creates via ensureThread)
		const remoteId = crypto.randomUUID();
		return { remoteId, externalId: undefined };
	},

	async rename(remoteId, title) {
		await fetch(`/api/threads/${remoteId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title }),
		});
	},

	async archive(remoteId) {
		await fetch(`/api/threads/${remoteId}`, { method: "DELETE" });
	},

	async unarchive() {},

	async delete(remoteId) {
		await fetch(`/api/threads/${remoteId}`, { method: "DELETE" });
	},

	async fetch(remoteId) {
		return { remoteId, status: "regular" as const };
	},

	async generateTitle(remoteId, messages) {
		return createAssistantStream(async (controller) => {
			const firstUser = messages.find((m) => m.role === "user");
			const text =
				firstUser?.content
					?.filter(
						(c): c is { type: "text"; text: string } => c.type === "text",
					)
					.map((c) => c.text)
					.join(" ") ?? "";

			if (!text) {
				controller.appendText("新对话");
				return;
			}

			// Call server to generate + persist LLM title in one step
			try {
				const res = await fetch(`/api/threads/${remoteId}/generate-title`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ text: text.slice(0, 200) }),
				});
				if (res.ok) {
					const { title } = (await res.json()) as { title: string };
					controller.appendText(title || text.slice(0, 30));
				} else {
					controller.appendText(text.slice(0, 30));
				}
			} catch {
				controller.appendText(text.slice(0, 30));
			}
		});
	},

	unstable_Provider: ThreadAdapterProvider,
};

// ── Per-Thread Adapter Provider ─────────────────────────────────────────────

const threadAdapters = { attachments: attachmentAdapter };

function ThreadAdapterProvider({ children }: { children: ReactNode }) {
	return (
		<RuntimeAdapterProvider adapters={threadAdapters}>
			{children}
		</RuntimeAdapterProvider>
	);
}

// ── Runtime Hook (per-thread) ───────────────────────────────────────────────
// Uses useChat + useAISDKRuntime directly (not useChatRuntime) so we can
// call chat.setMessages() after loading history from the server.

function useMyRuntime() {
	const aui = useAui();
	const { persona } = usePersona();

	// Sync TTS voice + params to current persona
	const currentPersona = PERSONAS[persona];
	ttsAdapter.voiceId = currentPersona.voiceId;
	ttsAdapter.voiceSpeed = currentPersona.voiceSpeed;
	ttsAdapter.voiceStability = currentPersona.voiceStability;

	const stateRef = useRef(aui.threadListItem().getState());
	stateRef.current = aui.threadListItem().getState();

	const remoteId = stateRef.current.remoteId;

	// Fetch messages for existing threads
	const [loadedMessages, setLoadedMessages] = useState<UIMessage[]>([]);
	useEffect(() => {
		if (!remoteId) return;
		let cancelled = false;
		fetch(`/api/threads/${remoteId}/messages`)
			.then((r) => (r.ok ? r.json() : []))
			.then((msgs) => {
				if (!cancelled) setLoadedMessages(msgs as UIMessage[]);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [remoteId]);

	// Dynamic header: reads remoteId at send time (after initialize()).
	// IMPORTANT: Read from aui store directly (not stateRef) to avoid a race
	// condition where initialize() has resolved but React hasn't re-rendered
	// yet, causing stateRef.current.remoteId to still be undefined and the
	// local __LOCALID_xxx to be sent as x-thread-id — which creates a
	// duplicate thread on the backend and splits the conversation.
	const personaRef = useRef(persona);
	personaRef.current = persona;

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				headers: async () => {
					// Wait for initialize() to resolve remoteId (max ~500ms)
					let state = aui.threadListItem().getState();
					for (let i = 0; i < 50 && !state.remoteId; i++) {
						await new Promise((r) => setTimeout(r, 10));
						state = aui.threadListItem().getState();
					}
					const threadId = state.remoteId ?? state.id;
					return {
						"x-thread-id": threadId,
						"x-persona": personaRef.current,
						"x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
						"x-active-doc": sessionStorage.getItem("center:activeTab") ?? "",
						"x-auto-tts": autoTTSFlag ? "1" : "0",
					};
				},
			}),
		[aui],
	);

	// Use stable local ID for useChat's internal state (never changes).
	// remoteId is only used in transport headers for the server.
	const chat = useChat({
		id: stateRef.current.id,
		transport,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
	});

	// Sync loaded messages into the Chat instance after fetch completes
	useEffect(() => {
		if (loadedMessages.length > 0) {
			chat.setMessages(loadedMessages);
		}
	}, [loadedMessages, chat.setMessages]);

	// Merge voice messages into chat when returning from voice mode
	const { voiceMode } = useVoiceMode();
	useEffect(() => {
		if (voiceMode.active || !pendingVoiceMsgs) return;
		const voiceMsgs = pendingVoiceMsgs;
		pendingVoiceMsgs = null;

		// Insert a separator + voice transcripts into the chat
		const existing = chat.messages;
		const separator = {
			id: crypto.randomUUID(),
			role: "user" as const,
			parts: [{ type: "text" as const, text: "🎙 进入语音陪读" }],
		};
		const converted = voiceMsgs.map((m) => ({
			id: crypto.randomUUID(),
			role: m.role as "user" | "assistant",
			parts: [
				{
					type: "text" as const,
					text: m.role === "assistant" ? `🎙 ${m.text}` : m.text,
				},
			],
		}));
		chat.setMessages([...existing, separator, ...converted]);

		// Persist to DB
		const threadId = aui.threadListItem().getState().remoteId;
		if (threadId) {
			fetch(`/api/threads/${threadId}/voice-messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messages: [separator, ...converted] }),
			}).catch(() => {});
		}

		// Scroll to bottom after merge
		setTimeout(() => {
			document
				.querySelector(
					"[data-role='assistant']:last-child, [data-role='user']:last-child",
				)
				?.scrollIntoView({ behavior: "smooth" });
		}, 100);
	}, [voiceMode.active, chat.messages, chat.setMessages, aui]);

	return useAISDKRuntime(chat, {
		adapters: runtimeAdapters,
	});
}

// ── Root Provider ───────────────────────────────────────────────────────────

const AUTO_TTS_KEY = "settings:autoTTS";

export const RuntimeProvider: FC<{ children: ReactNode }> = ({ children }) => {
	const [persona, setPersonaRaw] = useState<PersonaId>(() => {
		try {
			const saved = localStorage.getItem("settings:persona");
			if (saved && saved in PERSONAS) return saved as PersonaId;
		} catch {}
		return DEFAULT_PERSONA;
	});
	const setPersona = useCallback((id: PersonaId) => {
		setPersonaRaw(id);
		try {
			localStorage.setItem("settings:persona", id);
		} catch {}
	}, []);
	const personaCtx = useMemo(
		() => ({ persona, setPersona }),
		[persona, setPersona],
	);

	const [autoTTS, setAutoTTSRaw] = useState(() => {
		try {
			const v = localStorage.getItem(AUTO_TTS_KEY) !== "false";
			autoTTSFlag = v;
			return v;
		} catch {
			return true;
		}
	});
	const setAutoTTS = useCallback((v: boolean) => {
		setAutoTTSRaw(v);
		autoTTSFlag = v;
		try {
			localStorage.setItem(AUTO_TTS_KEY, String(v));
		} catch {}
	}, []);
	const autoTTSCtx = useMemo(
		() => ({ autoTTS, setAutoTTS }),
		[autoTTS, setAutoTTS],
	);

	const runtime = useRemoteThreadListRuntime({
		runtimeHook: useMyRuntime,
		adapter: threadListAdapter,
	});

	// ── Voice mode ────────────────────────────────────────────────────────
	const [voiceMode, setVoiceMode] = useState<VoiceModeState>({
		active: false,
		docId: null,
		docTitle: null,
		systemPrompt: null,
	});

	const enterVoiceMode = useCallback(
		async (docId: string, docTitle: string) => {
			// Stop any ongoing TTS before entering voice mode
			try {
				const speech = runtime.thread.getState().speech;
				if (speech) runtime.thread.stopSpeaking();
			} catch {}

			// Fetch document content for system prompt injection
			let docContent = "";
			try {
				const res = await fetch(`/api/documents/${docId}/markdown`);
				if (res.ok) docContent = await res.text();
			} catch {}

			// Summarize recent text conversation for voice context continuity
			let chatSummary = "";
			try {
				const msgs = runtime.thread.getState().messages;
				const recent = msgs.slice(-10);
				if (recent.length > 0) {
					chatSummary = recent
						.map((m) => {
							const text = m.content
								.filter(
									(p): p is { type: "text"; text: string } => p.type === "text",
								)
								.map((p) => p.text)
								.join(" ");
							return `${m.role === "user" ? "学生" : "导师"}：${text.slice(0, 200)}`;
						})
						.join("\n");
				}
			} catch {}

			const p = PERSONAS[persona];
			const truncated = docContent.slice(0, 12000);

			const prompt = `${p.prompt}

# 语音对话规则
- 你正在与学生进行实时语音对话，讨论一篇文档
- 回答简洁口语化，每次回复控制在3-5句话以内
- 禁止输出 markdown、代码块、列表符号等书面格式
- 可以主动追问学生的理解，引导深入讨论

# 正在阅读的文档：「${docTitle}」

${truncated}${chatSummary ? `\n\n# 之前的文字对话记录（供参考）\n${chatSummary}` : ""}`;

			setVoiceMode({ active: true, docId, docTitle, systemPrompt: prompt });
		},
		[persona, runtime],
	);

	const exitVoiceMode = useCallback((voiceMessages?: VoiceTranscript[]) => {
		if (voiceMessages && voiceMessages.length > 0) {
			pendingVoiceMsgs = voiceMessages;
		}
		setVoiceMode({
			active: false,
			docId: null,
			docTitle: null,
			systemPrompt: null,
		});
	}, []);

	const voiceModeCtx = useMemo(
		() => ({ voiceMode, enterVoiceMode, exitVoiceMode }),
		[voiceMode, enterVoiceMode, exitVoiceMode],
	);

	// ── Dialogue mode ─────────────────────────────────────────────────────
	const [dialogueMode, setDialogueMode] = useState<DialogueModeState>({
		active: false,
	});

	const enterDialogueMode = useCallback(() => {
		// Stop any ongoing TTS/speech
		try {
			const speech = runtime.thread.getState().speech;
			if (speech) runtime.thread.stopSpeaking();
		} catch {}
		setDialogueMode({ active: true });
	}, [runtime]);

	const exitDialogueMode = useCallback(() => {
		setDialogueMode({ active: false });
	}, []);

	const dialogueModeCtx = useMemo(
		() => ({ dialogueMode, enterDialogueMode, exitDialogueMode }),
		[dialogueMode, enterDialogueMode, exitDialogueMode],
	);

	return (
		<PersonaCtx value={personaCtx}>
			<AutoTTSCtx value={autoTTSCtx}>
				<VoiceModeCtx value={voiceModeCtx}>
					<DialogueModeCtx value={dialogueModeCtx}>
						<AssistantRuntimeProvider runtime={runtime}>
							<PersonaSync />
							<AutoSpeakWatcher />
							{/* Each tool UI matches a backend tool by toolName */}
							<AskUserToolUI />
							<SearchToolUI />
							<AcademicSearchToolUI />
							<DocSuggestToolUI />
							<DocSearchToolUI />
							<OpenDocToolUI />
							<HighlightDocToolUI />
							<ReadDocToolUI />
							<RecipeToolUI />
							<SaveMemoryToolUI />
							{children}
						</AssistantRuntimeProvider>
					</DialogueModeCtx>
				</VoiceModeCtx>
			</AutoTTSCtx>
		</PersonaCtx>
	);
};

/** Syncs persona state when the active thread changes. */
function PersonaSync() {
	const { setPersona } = usePersona();
	const remoteId = useAuiState((s) => s.threadListItem.remoteId);

	useEffect(() => {
		const mapped = remoteId ? threadPersonaMap.get(remoteId) : undefined;
		if (mapped) setPersona(mapped);
	}, [remoteId, setPersona]);

	return null;
}

// ── Streaming sentence-level TTS ──────────────────────────────────────────

const MIN_CHARS = 20;
const MAX_CHARS = 100;

/** Pre-fetching sequential audio queue.
 *  Fetches start immediately on enqueue(); playback is strictly sequential. */
class TTSPlayQueue {
	private items: Promise<Blob | null>[] = [];
	private playing = false;
	private abortCtrl = new AbortController();
	onIdle?: () => void;

	enqueue(text: string) {
		const t = text.trim();
		if (!t || this.abortCtrl.signal.aborted) return;
		this.items.push(fetchTTSBlob(t, ttsAdapter.voiceParams));
		if (!this.playing) this.drain();
	}

	abort() {
		this.abortCtrl.abort();
		this.items.length = 0;
	}

	private async drain() {
		this.playing = true;
		let isFirst = true;
		while (this.items.length > 0 && !this.abortCtrl.signal.aborted) {
			const blobPromise = this.items.shift() as Promise<Blob | null>;
			const blob = await blobPromise;
			if (!blob || blob.size === 0 || this.abortCtrl.signal.aborted) continue;
			// Brief pause between segments for natural pacing
			if (!isFirst) await new Promise((r) => setTimeout(r, CHUNK_GAP_MS));
			if (this.abortCtrl.signal.aborted) break;
			await playBlob(blob, this.abortCtrl.signal);
			isFirst = false;
		}
		this.playing = false;
		if (!this.abortCtrl.signal.aborted) this.onIdle?.();
	}
}

/** Streaming TTS with smart batching:
 *  - First chunk: sent to fetch as soon as MIN_CHARS at a sentence boundary
 *  - Subsequent: accumulate in buffer until first audio finishes playing
 *  - MAX_CHARS: force-send if buffer grows too large
 *  - On generation end: flush immediately */
class StreamingTTS {
	private buffer = "";
	private firstSent = false;
	private firstDone = false;
	private aborted = false;
	readonly queue = new TTSPlayQueue();

	constructor() {
		this.queue.onIdle = () => {
			if (!this.firstDone && this.firstSent) {
				this.firstDone = true;
				this.trySend(false);
			}
		};
	}

	addSentence(text: string) {
		if (this.aborted || !text.trim()) return;
		this.buffer += text;
		this.trySend(false);
	}

	flush() {
		if (this.aborted) return;
		this.trySend(true);
	}

	abort() {
		this.aborted = true;
		this.buffer = "";
		this.queue.abort();
	}

	private trySend(force: boolean) {
		const text = this.buffer.trim();
		if (!text) return;
		const overMax = text.length >= MAX_CHARS;

		if (!this.firstSent) {
			if (text.length >= MIN_CHARS || force || overMax) {
				this.buffer = "";
				this.firstSent = true;
				this.queue.enqueue(text);
			}
		} else if (this.firstDone || force || overMax) {
			this.buffer = "";
			this.queue.enqueue(text);
		}
	}
}

/** Watches LLM streaming output and feeds sentences to StreamingTTS.
 *  Bridges into assistant-ui speech state via ttsAdapter proxy mode,
 *  so the speak/stop button in the message UI reflects auto-TTS state. */
function AutoSpeakWatcher() {
	const { autoTTS } = useAutoTTS();
	const { voiceMode } = useVoiceMode();
	const aui = useAui();
	const isRunning = useAuiState((s) => s.thread.isRunning);
	const isDictating = useAuiState((s) => s.composer.dictation != null);
	const wasRunning = useRef(false);
	const ttsRef = useRef<StreamingTTS | null>(null);
	const spokenLenRef = useRef(0);

	// Dictation started → abort TTS immediately
	useEffect(() => {
		if (isDictating && ttsRef.current) {
			ttsRef.current.abort();
			ttsRef.current = null;
			ttsAdapter.endProxy();
		}
	}, [isDictating]);

	// Single effect handles both transitions and polling
	useEffect(() => {
		// ── Transition: idle → running (new generation started) ──
		if (!wasRunning.current && isRunning) {
			ttsRef.current?.abort();
			ttsAdapter.endProxy();
			if (autoTTS && !voiceMode.active) {
				ttsRef.current = new StreamingTTS();
				spokenLenRef.current = 0;
			} else {
				ttsRef.current = null;
			}
			const speech = aui.thread().getState().speech;
			if (speech) aui.thread().stopSpeaking();
		}

		// ── Transition: running → idle (generation finished) ──
		if (wasRunning.current && !isRunning && ttsRef.current) {
			const tts = ttsRef.current;
			// Consume any final text
			const fullText = getLastAssistantText(aui);
			const remaining = fullText.slice(spokenLenRef.current);
			if (remaining.trim()) tts.addSentence(remaining);
			tts.flush();
			spokenLenRef.current = 0;

			// Bridge into assistant-ui speech state via proxy utterance.
			// This makes the message's speak button show "stop" during auto-TTS,
			// and clicking stop will abort the streaming TTS.
			ttsAdapter.enterProxyMode(() => {
				tts.abort();
				ttsRef.current = null;
			});
			const msgs = aui.thread().getState().messages;
			const last = [...msgs].reverse().find((m) => m.role === "assistant");
			if (last) {
				aui.thread().message({ id: last.id }).speak();
				// End proxy when queue drains
				const origOnIdle = tts.queue.onIdle;
				tts.queue.onIdle = () => {
					origOnIdle?.();
					ttsAdapter.endProxy();
				};
			}
		}

		wasRunning.current = isRunning;

		// ── Polling: feed sentences during streaming ──
		if (!isRunning || !ttsRef.current) return;
		const tts = ttsRef.current;
		const interval = setInterval(() => {
			const fullText = getLastAssistantText(aui);
			const unspoken = fullText.slice(spokenLenRef.current);
			if (!unspoken) return;
			const parts = unspoken.split(SENTENCE_RE);
			for (let i = 0; i < parts.length - 1; i++) {
				tts.addSentence(parts[i]);
				spokenLenRef.current += parts[i].length;
			}
		}, 200);
		return () => clearInterval(interval);
	}, [isRunning, autoTTS, voiceMode.active, aui]);

	return null;
}

function getLastAssistantText(aui: ReturnType<typeof useAui>): string {
	const msgs = aui.thread().getState().messages;
	const last = [...msgs].reverse().find((m) => m.role === "assistant");
	if (!last) return "";
	return last.content
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("");
}

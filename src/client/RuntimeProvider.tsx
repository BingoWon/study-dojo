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
import {
	buildChatSummary,
	getActiveDocId,
	getActiveDocTitle,
} from "./lib/doc-context";
import { ElevenLabsScribeAdapter } from "./lib/elevenlabs-scribe-adapter";
import { ElevenLabsTTSAdapter } from "./lib/elevenlabs-tts-adapter";
import type { VoiceTranscript } from "./lib/elevenlabs-voice-adapter";
import { StreamingTTSPlayer } from "./lib/tts-utils";

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
	docTitle: string | null;
	systemPrompt: string | null;
}

const VoiceModeCtx = createContext<{
	voiceMode: VoiceModeState;
	enterVoiceMode: () => void;
	exitVoiceMode: (voiceMessages?: VoiceTranscript[]) => void;
}>({
	voiceMode: { active: false, docTitle: null, systemPrompt: null },
	enterVoiceMode: () => {},
	exitVoiceMode: () => {},
});

export const useVoiceMode = () => useContext(VoiceModeCtx);

// ── Dialogue Mode Context ────────────────────────────────────────────────

export interface DialogueModeState {
	active: boolean;
}

export interface DialogueTranscript {
	role: "user" | "assistant";
	speech: string;
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

/** Module-level ref for persistDialogueTurn (set by useMyRuntime). */
let persistDialogueTurnFn: ((turn: DialogueTranscript) => void) | null = null;

/** Called by DialogueThread for each completed turn. */
export function persistDialogueTurn(turn: DialogueTranscript) {
	persistDialogueTurnFn?.(turn);
}

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

/** Remote thread ID captured at mode entry — ensures DB writes go to the right thread. */
let capturedThreadId: string | null = null;

/** Monotonic counter bumped on voice/dialogue exit to signal useMyRuntime to reload. */
let reloadGeneration = 0;

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

/** Get the persona for a thread (used by ThreadListSidebar for avatars). */
export function getThreadPersona(remoteId: string): PersonaId {
	return threadPersonaMap.get(remoteId) ?? DEFAULT_PERSONA;
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
	const [fetchKey, setFetchKey] = useState(0);
	const lastGenRef = useRef(reloadGeneration);

	// Detect when reloadGeneration is bumped (voice/dialogue exit)
	if (reloadGeneration !== lastGenRef.current) {
		lastGenRef.current = reloadGeneration;
		// Schedule a re-fetch after a short delay (DB write may still be in flight)
		setTimeout(() => setFetchKey((k) => k + 1), 300);
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: fetchKey triggers reload
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
	}, [remoteId, fetchKey]);

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

	// Real-time persistence for dialogue turns — DB only, no chat.setMessages
	const persistTurn = useCallback(
		(turn: { role: "user" | "assistant"; speech: string }) => {
			const remoteId = capturedThreadId;
			if (!remoteId) {
				console.error(
					"[dialogue] No capturedThreadId — message NOT persisted!",
				);
				return;
			}
			const msg = {
				id: crypto.randomUUID(),
				role: turn.role,
				parts: [{ type: "text" as const, text: turn.speech }],
			};
			fetch(`/api/threads/${remoteId}/voice-messages`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-persona": persona,
				},
				body: JSON.stringify({ messages: [msg] }),
			})
				.then((r) => {
					if (!r.ok) console.error("[dialogue] Persist failed:", r.status);
				})
				.catch((e) => console.error("[dialogue] Persist error:", e));
		},
		[persona],
	);
	persistDialogueTurnFn = persistTurn;

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
		docTitle: null,
		systemPrompt: null,
	});

	const enterVoiceMode = useCallback(async () => {
		// Capture current thread IDs before mode switch
		const urlMatch = window.location.pathname.match(/\/c\/([0-9a-f-]{36})/);
		capturedThreadId = urlMatch ? urlMatch[1] : null;

		// Stop any ongoing TTS
		try {
			const speech = runtime.thread.getState().speech;
			if (speech) runtime.thread.stopSpeaking();
		} catch {}

		// Build system prompt with document + chat context
		const activeDocId = getActiveDocId();
		const docTitle = getActiveDocTitle();

		let docContent = "";
		if (activeDocId) {
			try {
				const res = await fetch(`/api/documents/${activeDocId}/markdown`);
				if (res.ok) docContent = await res.text();
			} catch {}
		}

		const chatSummary = buildChatSummary(runtime.thread.getState().messages);

		const p = PERSONAS[persona];
		const truncated = docContent.slice(0, 12000);

		let prompt = `${p.prompt}

# 语音对话规则
- 你正在与学生进行实时语音对话
- 回答简洁口语化，每次回复控制在3-5句话以内
- 禁止输出 markdown、代码块、列表符号等书面格式
- 可以主动追问学生的理解，引导深入讨论`;

		if (truncated) {
			prompt += `\n\n# 正在阅读的文档${docTitle ? `：「${docTitle}」` : ""}\n\n${truncated}`;
		}
		if (chatSummary) {
			prompt += `\n\n# 之前的文字对话记录（供参考）\n${chatSummary}`;
		}

		setVoiceMode({
			active: true,
			docTitle: docTitle || "语音伴读",
			systemPrompt: prompt,
		});
	}, [persona, runtime]);

	const exitVoiceMode = useCallback(
		async (voiceMessages?: VoiceTranscript[]) => {
			// Persist voice messages to DB synchronously before switching back
			if (voiceMessages && voiceMessages.length > 0 && capturedThreadId) {
				const separator = {
					id: crypto.randomUUID(),
					role: "user" as const,
					parts: [{ type: "text" as const, text: "🎙 [进入语音伴读]" }],
				};
				const converted = voiceMessages.map((m) => ({
					id: crypto.randomUUID(),
					role: m.role as "user" | "assistant",
					parts: [
						{
							type: "text" as const,
							text: m.role === "assistant" ? `🎙 ${m.text}` : m.text,
						},
					],
				}));
				await fetch(`/api/threads/${capturedThreadId}/voice-messages`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-persona": persona,
					},
					body: JSON.stringify({ messages: [separator, ...converted] }),
				}).catch((e) => console.error("[voice] Persist failed:", e));
			}
			setVoiceMode({ active: false, docTitle: null, systemPrompt: null });
			// Bump reload generation so useMyRuntime re-fetches messages from DB
			reloadGeneration++;
			// Update URL to original thread
			if (capturedThreadId) {
				window.history.replaceState(null, "", `/c/${capturedThreadId}`);
			}
		},
		[persona],
	);

	const voiceModeCtx = useMemo(
		() => ({ voiceMode, enterVoiceMode, exitVoiceMode }),
		[voiceMode, enterVoiceMode, exitVoiceMode],
	);

	// ── Dialogue mode ─────────────────────────────────────────────────────
	const [dialogueMode, setDialogueMode] = useState<DialogueModeState>({
		active: false,
	});

	const enterDialogueMode = useCallback(() => {
		// Capture current thread IDs before mode switch
		const urlMatch = window.location.pathname.match(/\/c\/([0-9a-f-]{36})/);
		capturedThreadId = urlMatch ? urlMatch[1] : null;

		// Stop any ongoing TTS/speech
		try {
			const speech = runtime.thread.getState().speech;
			if (speech) runtime.thread.stopSpeaking();
		} catch {}
		setDialogueMode({ active: true });
	}, [runtime]);

	const exitDialogueMode = useCallback(() => {
		setDialogueMode({ active: false });
		// Bump reload generation so useMyRuntime re-fetches messages from DB
		reloadGeneration++;
		// Update URL to original thread
		if (capturedThreadId) {
			window.history.replaceState(null, "", `/c/${capturedThreadId}`);
		}
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

// ── Streaming sentence-level TTS (uses shared StreamingTTSPlayer) ────────

/** Watches LLM streaming output and feeds text to StreamingTTSPlayer.
 *  Bridges into assistant-ui speech state via ttsAdapter proxy mode,
 *  so the speak/stop button in the message UI reflects auto-TTS state. */
function AutoSpeakWatcher() {
	const { autoTTS } = useAutoTTS();
	const { voiceMode } = useVoiceMode();
	const aui = useAui();
	const isRunning = useAuiState((s) => s.thread.isRunning);
	const isDictating = useAuiState((s) => s.composer.dictation != null);
	const wasRunning = useRef(false);
	const ttsRef = useRef<StreamingTTSPlayer | null>(null);

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
				ttsRef.current = new StreamingTTSPlayer(ttsAdapter.voiceParams);
			} else {
				ttsRef.current = null;
			}
			const speech = aui.thread().getState().speech;
			if (speech) aui.thread().stopSpeaking();
		}

		// ── Transition: running → idle (generation finished) ──
		if (wasRunning.current && !isRunning && ttsRef.current) {
			const tts = ttsRef.current;
			const fullText = getLastAssistantText(aui);
			tts.flush(fullText);

			// Bridge into assistant-ui speech state via proxy utterance
			ttsAdapter.enterProxyMode(() => {
				tts.abort();
				ttsRef.current = null;
			});
			const msgs = aui.thread().getState().messages;
			const last = [...msgs].reverse().find((m) => m.role === "assistant");
			if (last) {
				aui.thread().message({ id: last.id }).speak();
				tts.onIdle = () => ttsAdapter.endProxy();
			}
		}

		wasRunning.current = isRunning;

		// ── Polling: feed full text during streaming ──
		if (!isRunning || !ttsRef.current) return;
		const tts = ttsRef.current;
		const interval = setInterval(() => {
			const fullText = getLastAssistantText(aui);
			if (fullText) tts.feedText(fullText);
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

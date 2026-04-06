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
import { DEFAULT_PERSONA, PERSONAS, type PersonaId } from "../worker/model";
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
import { ElevenLabsVoiceAdapter } from "./lib/elevenlabs-voice-adapter";

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
}

const VoiceModeCtx = createContext<{
	voiceMode: VoiceModeState;
	enterVoiceMode: (docId: string, docTitle: string) => void;
	exitVoiceMode: () => void;
}>({
	voiceMode: { active: false, docId: null, docTitle: null },
	enterVoiceMode: () => {},
	exitVoiceMode: () => {},
});

export const useVoiceMode = () => useContext(VoiceModeCtx);

// ── ElevenLabs Adapters (stable module-scope instances) ─────────────────────

const scribeAdapter = new ElevenLabsScribeAdapter({
	tokenEndpoint: "/api/scribe-token",
	languageCode: "zh",
	toSimplified: true, // convert Traditional → Simplified Chinese
});

const ttsAdapter = new ElevenLabsTTSAdapter({ endpoint: "/api/tts" });

const voiceAdapter = new ElevenLabsVoiceAdapter({
	signedUrlEndpoint: "/api/voice-signed-url",
});

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
			threadPersonaMap.set(t.id, (t.persona ?? "professor") as PersonaId);
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

	// Sync TTS voice to current persona
	ttsAdapter.voiceId = PERSONAS[persona].voiceId;

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
				headers: () => {
					const freshState = aui.threadListItem().getState();
					const threadId = freshState.remoteId ?? freshState.id;
					return {
						"x-thread-id": threadId,
						"x-persona": personaRef.current,
						"x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
						"x-active-doc": sessionStorage.getItem("center:activeTab") ?? "",
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

	const { voiceMode } = useVoiceMode();

	return useAISDKRuntime(chat, {
		adapters: {
			dictation: scribeAdapter,
			speech: ttsAdapter,
			...(voiceMode.active ? { voice: voiceAdapter } : {}),
		},
	});
}

// ── Root Provider ───────────────────────────────────────────────────────────

const AUTO_TTS_KEY = "settings:autoTTS";

export const RuntimeProvider: FC<{ children: ReactNode }> = ({ children }) => {
	const [persona, setPersona] = useState<PersonaId>(DEFAULT_PERSONA);
	const personaCtx = useMemo(() => ({ persona, setPersona }), [persona]);

	const [autoTTS, setAutoTTSRaw] = useState(() => {
		try {
			return localStorage.getItem(AUTO_TTS_KEY) !== "false";
		} catch {
			return true;
		}
	});
	const setAutoTTS = useCallback((v: boolean) => {
		setAutoTTSRaw(v);
		try {
			localStorage.setItem(AUTO_TTS_KEY, String(v));
		} catch {}
	}, []);
	const autoTTSCtx = useMemo(
		() => ({ autoTTS, setAutoTTS }),
		[autoTTS, setAutoTTS],
	);

	// ── Voice mode ────────────────────────────────────────────────────────
	const [voiceMode, setVoiceMode] = useState<VoiceModeState>({
		active: false,
		docId: null,
		docTitle: null,
	});

	const enterVoiceMode = useCallback(
		async (docId: string, docTitle: string) => {
			// Fetch document content for system prompt injection
			let docContent = "";
			try {
				const res = await fetch(`/api/documents/${docId}/markdown`);
				if (res.ok) docContent = await res.text();
			} catch {}

			const p = PERSONAS[persona];
			const truncated = docContent.slice(0, 12000);
			voiceAdapter.configure({
				systemPrompt: `${p.prompt}\n\n你正在和学生进行实时语音对话，讨论下面这篇文档。回答简洁口语化，适合语音交流，不要输出 markdown 格式。\n\n## 正在阅读的文档：「${docTitle}」\n\n${truncated}`,
				voiceId: p.voiceId,
			});

			setVoiceMode({ active: true, docId, docTitle });
		},
		[persona],
	);

	const exitVoiceMode = useCallback(() => {
		setVoiceMode({ active: false, docId: null, docTitle: null });
	}, []);

	const voiceModeCtx = useMemo(
		() => ({ voiceMode, enterVoiceMode, exitVoiceMode }),
		[voiceMode, enterVoiceMode, exitVoiceMode],
	);

	const runtime = useRemoteThreadListRuntime({
		runtimeHook: useMyRuntime,
		adapter: threadListAdapter,
	});

	return (
		<PersonaCtx value={personaCtx}>
			<AutoTTSCtx value={autoTTSCtx}>
				<VoiceModeCtx value={voiceModeCtx}>
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

/** Auto-speaks last assistant message when generation finishes. */
function AutoSpeakWatcher() {
	const { autoTTS } = useAutoTTS();
	const aui = useAui();
	const isRunning = useAuiState((s) => s.thread.isRunning);
	const wasRunning = useRef(false);

	useEffect(() => {
		if (wasRunning.current && !isRunning && autoTTS) {
			// Generation just finished — speak the last assistant message
			const messages = aui.thread().getState().messages;
			const last = [...messages].reverse().find((m) => m.role === "assistant");
			if (last) {
				const text = last.content
					.filter((p): p is { type: "text"; text: string } => p.type === "text")
					.map((p) => p.text)
					.join("\n");
				if (text.trim()) {
					ttsAdapter.speak(text);
				}
			}
		}
		wasRunning.current = isRunning;
	}, [isRunning, autoTTS, aui]);

	return null;
}

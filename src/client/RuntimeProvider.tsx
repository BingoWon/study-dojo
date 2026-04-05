import type { UIMessage } from "@ai-sdk/react";
import type { AttachmentAdapter } from "@assistant-ui/react";
import {
	AssistantRuntimeProvider,
	RuntimeAdapterProvider,
	useAui,
	useRemoteThreadListRuntime,
	type RemoteThreadListAdapter,
} from "@assistant-ui/react";
import {
	AssistantChatTransport,
	useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { createAssistantStream } from "assistant-stream";
import {
	type FC,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";

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

const threadListAdapter: RemoteThreadListAdapter = {
	async list() {
		const res = await fetch("/api/threads");
		if (!res.ok) return { threads: [] };
		const threads = (await res.json()) as {
			id: string;
			title: string;
		}[];
		return {
			threads: threads.map((t) => ({
				remoteId: t.id,
				status: "regular" as const,
				title: t.title,
			})),
		};
	},

	async initialize(localId) {
		return { remoteId: localId, externalId: undefined };
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

	async generateTitle(_remoteId, messages) {
		return createAssistantStream(async (controller) => {
			const firstUser = messages.find((m) => m.role === "user");
			const text =
				firstUser?.content
					?.filter(
						(c): c is { type: "text"; text: string } => c.type === "text",
					)
					.map((c) => c.text)
					.join(" ") ?? "";
			controller.appendText(
				text ? text.slice(0, 30) + (text.length > 30 ? "…" : "") : "新对话",
			);
		});
	},

	unstable_Provider: ThreadAdapterProvider,
};

// ── Per-Thread Adapter Provider ─────────────────────────────────────────────

function ThreadAdapterProvider({ children }: { children: ReactNode }) {
	const adapters = useMemo(() => ({ attachments: attachmentAdapter }), []);
	return (
		<RuntimeAdapterProvider adapters={adapters}>
			{children}
		</RuntimeAdapterProvider>
	);
}

// ── Runtime Hook (per-thread) ───────────────────────────────────────────────
// Loads messages from server for existing threads, passes to useChatRuntime.

function useMyRuntime() {
	const aui = useAui();
	const state = aui.threadListItem().getState();
	const threadId = state.remoteId ?? state.id;

	// Load messages for existing threads
	const [messages, setMessages] = useState<UIMessage[] | undefined>(undefined);
	useEffect(() => {
		if (!state.remoteId) {
			setMessages(undefined);
			return;
		}
		fetch(`/api/threads/${state.remoteId}/messages`)
			.then((r) => (r.ok ? r.json() : []))
			.then((msgs) => setMessages(msgs as UIMessage[]))
			.catch(() => setMessages(undefined));
	}, [state.remoteId]);

	const transport = useMemo(
		() =>
			new AssistantChatTransport({
				api: "/api/chat",
				headers: { "x-thread-id": threadId },
			}),
		[threadId],
	);

	return useChatRuntime({
		transport,
		messages,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
	});
}

// ── Root Provider ───────────────────────────────────────────────────────────

export const RuntimeProvider: FC<{ children: ReactNode }> = ({ children }) => {
	const runtime = useRemoteThreadListRuntime({
		runtimeHook: useMyRuntime,
		adapter: threadListAdapter,
	});

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			{children}
		</AssistantRuntimeProvider>
	);
};

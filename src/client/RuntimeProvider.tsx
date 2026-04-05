import { type UIMessage, useChat } from "@ai-sdk/react";
import type { AttachmentAdapter } from "@assistant-ui/react";
import {
	AssistantRuntimeProvider,
	RuntimeAdapterProvider,
	useAui,
	useRemoteThreadListRuntime,
	type RemoteThreadListAdapter,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { createAssistantStream } from "assistant-stream";
import { type FC, type ReactNode, useEffect, useMemo, useState } from "react";

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
				const res = await fetch(
					`/api/threads/${remoteId}/generate-title`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ text: text.slice(0, 200) }),
					},
				);
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
	const state = aui.threadListItem().getState();
	const threadId = state.remoteId ?? state.id;

	// Fetch messages for existing threads
	const [loadedMessages, setLoadedMessages] = useState<UIMessage[]>([]);
	useEffect(() => {
		if (!state.remoteId) return;
		let cancelled = false;
		fetch(`/api/threads/${state.remoteId}/messages`)
			.then((r) => (r.ok ? r.json() : []))
			.then((msgs) => {
				if (!cancelled) setLoadedMessages(msgs as UIMessage[]);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [state.remoteId]);

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				headers: { "x-thread-id": threadId },
			}),
		[threadId],
	);

	const chat = useChat({
		id: threadId,
		transport,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
	});

	// Sync loaded messages into the Chat instance after fetch completes
	useEffect(() => {
		if (loadedMessages.length > 0) {
			chat.setMessages(loadedMessages);
		}
	}, [loadedMessages, chat.setMessages]);

	return useAISDKRuntime(chat);
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

import type { AttachmentAdapter } from "@assistant-ui/react";
import {
	AssistantRuntimeProvider,
	RuntimeAdapterProvider,
	useAui,
	useRemoteThreadListRuntime,
	type RemoteThreadListAdapter,
	type ThreadHistoryAdapter,
} from "@assistant-ui/react";
import {
	AssistantChatTransport,
	useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { createAssistantStream } from "assistant-stream";
import { type FC, type ReactNode, useMemo } from "react";

// ── Attachment Adapter ──────────────────────────────────────────────────────
// Universal adapter: images → ImagePart, others → FilePart (data URL)

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
		// The server creates the thread on first chat message (ensureThread).
		// We just return the localId as the remoteId.
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
		// We don't support archiving — delete instead
		await fetch(`/api/threads/${remoteId}`, { method: "DELETE" });
	},

	async unarchive() {
		// no-op
	},

	async delete(remoteId) {
		await fetch(`/api/threads/${remoteId}`, { method: "DELETE" });
	},

	async fetch(remoteId) {
		return { remoteId, status: "regular" as const };
	},

	async generateTitle(remoteId, messages) {
		return createAssistantStream(async (controller) => {
			const firstUser = messages.find((m) => m.role === "user");
			const text = firstUser?.content
				?.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join(" ");

			if (!text) {
				controller.appendText("新对话");
				return;
			}

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
					controller.appendText(title || text.slice(0, 50));
				} else {
					controller.appendText(text.slice(0, 50));
				}
			} catch {
				controller.appendText(text.slice(0, 50));
			}
		});
	},

	// Provider runs inside each thread's context — provides adapters per thread
	unstable_Provider: ThreadAdapterProvider,
};

// ── Per-Thread Adapter Provider ─────────────────────────────────────────────
// Provides ThreadHistoryAdapter (message persistence) and AttachmentAdapter
// for each thread instance. Runs inside ThreadListItemRuntimeProvider context.

function ThreadAdapterProvider({ children }: { children: ReactNode }) {
	const aui = useAui();

	const history = useMemo(
		() => ({
			async load() {
				const state = aui.threadListItem().getState();
				const threadId = state.remoteId;
				if (!threadId) return { messages: [] };

				try {
					const res = await fetch(`/api/threads/${threadId}/messages`);
					if (!res.ok) return { messages: [] };
					const msgs = (await res.json()) as Record<string, unknown>[];
					// Cast to ExportedMessageRepository format — our API returns
					// UIMessage-compatible objects that the runtime can consume
					return {
						messages: msgs.map(
							(m: Record<string, unknown>, i: number, arr: Record<string, unknown>[]) => ({
								parentId: i > 0 ? (arr[i - 1].id as string) : null,
								message: m,
							}),
						),
					};
				} catch {
					return { messages: [] };
				}
			},
			async append() {
				// Server persists messages in /api/chat onFinish callback — no-op here
			},
		}),
		[aui],
	) as unknown as ThreadHistoryAdapter;

	const adapters = useMemo(
		() => ({
			attachments: attachmentAdapter,
			history,
		}),
		[history],
	);

	return (
		<RuntimeAdapterProvider adapters={adapters}>
			{children}
		</RuntimeAdapterProvider>
	);
}

// ── Runtime Hook (per-thread) ───────────────────────────────────────────────

function useMyRuntime() {
	const aui = useAui();
	const state = aui.threadListItem().getState();
	const threadId = state.remoteId ?? state.id;

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

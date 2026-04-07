import {
	ThreadListItemPrimitive,
	ThreadListPrimitive,
	useAui,
	useAuiState,
} from "@assistant-ui/react";
import { UserButton, useUser } from "@clerk/react";
import { BookOpen, Brain, MessageSquare, Plus } from "lucide-react";
import { type FC, useState } from "react";
import { useThreadPersona } from "../RuntimeProvider";
import { CharacterAvatar } from "./CharacterAvatar";
import { DocumentsPanel } from "./sidebar/DocumentsPanel";
import { MemoryPanel } from "./sidebar/MemoryPanel";
import {
	InlineEdit,
	ITEM_ACTIVE,
	ITEM_BASE,
	ITEM_IDLE,
	ItemActions,
	timeAgo,
} from "./sidebar/shared";
import { ThemeToggle } from "./ThemeToggle";

export type SidebarTab = "chat" | "library" | "memory";

// ── Main Sidebar ────────────────────────────────────────────────────────────

export const ThreadListSidebar: FC<{
	activeTab: SidebarTab;
	setActiveTab: (tab: SidebarTab) => void;
	activeDocId: string | null;
	onDocSelect?: (
		docId: string,
		title: string,
		lang?: string | null,
		fileExt?: string | null,
	) => void;
}> = ({ activeTab, setActiveTab, activeDocId, onDocSelect }) => (
	<div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-950 select-none border-r border-divider dark:border-divider-dark">
		{/* Tab buttons */}
		<div className="flex items-center gap-1 p-3">
			{(
				[
					["chat", MessageSquare, "对话"],
					["library", BookOpen, "文档"],
					["memory", Brain, "记忆"],
				] as const
			).map(([id, Icon, label]) => (
				<button
					key={id}
					type="button"
					onClick={() => setActiveTab(id)}
					className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
						activeTab === id
							? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
							: "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
					}`}
				>
					<Icon className="w-3.5 h-3.5" />
					{label}
				</button>
			))}
		</div>

		{/* Tab content */}
		{activeTab === "chat" && (
			<>
				<div className="p-3">
					<ThreadListPrimitive.New asChild>
						<button
							type="button"
							className="flex items-center gap-2 w-full rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm font-medium px-3 py-2.5 transition border border-transparent hover:border-zinc-300 dark:hover:border-zinc-800 cursor-pointer"
						>
							<Plus className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
							开启新对话
						</button>
					</ThreadListPrimitive.New>
				</div>
				<div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-1">
					<ThreadListPrimitive.Items>
						{() => <RuntimeThreadItem />}
					</ThreadListPrimitive.Items>
				</div>
			</>
		)}

		{activeTab === "library" && (
			<DocumentsPanel activeDocId={activeDocId} onDocSelect={onDocSelect} />
		)}

		{activeTab === "memory" && <MemoryPanel />}

		<SidebarUserSection />
	</div>
);

// ── User Section ────────────────────────────────────────────────────────────

const SidebarUserSection: FC = () => {
	const { user } = useUser();
	return (
		<div className="flex items-center gap-3 px-3 py-3 border-t border-divider dark:border-divider-dark shrink-0">
			<UserButton appearance={{ elements: { avatarBox: "h-7 w-7" } }} />
			<span className="flex-1 truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
				{user?.fullName ||
					user?.username ||
					user?.primaryEmailAddress?.emailAddress ||
					""}
			</span>
			<ThemeToggle />
		</div>
	);
};

// ── Thread Item ─────────────────────────────────────────────────────────────

const RuntimeThreadItem: FC = () => {
	const aui = useAui();
	const [editing, setEditing] = useState(false);
	const title = useAuiState((s) => s.threadListItem.title) || "新对话";
	const id = useAuiState((s) => s.threadListItem.id);
	const remoteId = useAuiState((s) => s.threadListItem.remoteId) ?? "";
	const mainThreadId = useAuiState((s) => s.threads.mainThreadId);
	const isActive = id === mainThreadId;
	const persona = useThreadPersona(remoteId);
	const createdAt = useAuiState(
		(s) => (s.threadListItem as unknown as { createdAt?: number }).createdAt,
	);

	if (editing) {
		return (
			<ThreadListItemPrimitive.Root className="w-full">
				<InlineEdit
					icon={<CharacterAvatar persona={persona} size="xs" />}
					value={title}
					onSave={(newTitle) => aui.threadListItem().rename(newTitle)}
					onCancel={() => setEditing(false)}
				/>
			</ThreadListItemPrimitive.Root>
		);
	}

	return (
		<ThreadListItemPrimitive.Root className="w-full">
			<ThreadListItemPrimitive.Trigger
				className={`${ITEM_BASE} ${isActive ? ITEM_ACTIVE : ITEM_IDLE}`}
			>
				<div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
					<CharacterAvatar persona={persona} size="xs" />
					<div className="min-w-0 flex-1">
						<span className="block truncate">{title}</span>
						{createdAt && (
							<span className="text-[10px] text-zinc-400 dark:text-zinc-600">
								{timeAgo(createdAt)}
							</span>
						)}
					</div>
				</div>
				<ItemActions
					onEdit={() => setEditing(true)}
					onRemove={(e) => {
						e.stopPropagation();
						aui.threadListItem().archive();
					}}
				/>
			</ThreadListItemPrimitive.Trigger>
		</ThreadListItemPrimitive.Root>
	);
};

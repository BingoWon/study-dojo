import { MessageSquare, Plus, X } from "lucide-react";
import type { FC } from "react";
import type { Thread } from "../lib/useThreads";

export const ThreadListSidebar: FC<{
	threads: Thread[];
	activeThreadId: string | null;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
}> = ({ threads, activeThreadId, onSelect, onCreate, onDelete }) => {
	return (
		<div className="w-[260px] h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col border-r border-zinc-200 dark:border-white/5 transition-all flex-shrink-0 z-40 relative">
			{/* New Chat Button */}
			<div className="p-3">
				<button
					type="button"
					onClick={onCreate}
					className="flex items-center gap-2 w-full rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm font-medium px-3 py-2.5 transition border border-transparent hover:border-zinc-300 dark:hover:border-zinc-800 cursor-pointer"
				>
					<Plus className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
					开启新对话
				</button>
			</div>

			{/* Thread List */}
			<div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-1">
				{threads.map((t) => (
					<ThreadListItem
						key={t.id}
						title={t.title}
						isActive={t.id === activeThreadId}
						onClick={() => onSelect(t.id)}
						onDelete={(e) => {
							e.stopPropagation();
							onDelete(t.id);
						}}
					/>
				))}
			</div>
		</div>
	);
};

const ThreadListItem: FC<{
	title: string;
	isActive?: boolean;
	onClick: () => void;
	onDelete: (e: React.MouseEvent) => void;
}> = ({ title, isActive, onClick, onDelete }) => {
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(e) => e.key === "Enter" && onClick()}
			className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition cursor-pointer ${isActive ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
		>
			<div className="flex items-center gap-3 overflow-hidden">
				<MessageSquare className="w-4 h-4 opacity-50 shrink-0" />
				<span className="truncate whitespace-nowrap">{title}</span>
			</div>
			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
				<button
					type="button"
					onClick={onDelete}
					className="p-1 hover:text-red-500 transition cursor-pointer"
				>
					<X className="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
	);
};

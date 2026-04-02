import { Plus, MessageSquare, ChevronRight, X } from "lucide-react";
import { type FC } from "react";

export const ThreadListSidebar: FC = () => {
	return (
		<div className="w-[260px] h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col border-r border-zinc-200 dark:border-white/5 transition-all flex-shrink-0 z-40 relative">
			{/* New Chat Button */}
			<div className="p-3">
				<button
					type="button"
					className="flex items-center gap-2 w-full rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm font-medium px-3 py-2.5 transition border border-transparent hover:border-zinc-300 dark:hover:border-zinc-800 cursor-pointer"
				>
					<Plus className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
					开启新对话
				</button>
			</div>

			{/* Thread List */}
			<div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-1">
				<ThreadListItem title="天气与规划" />
				<ThreadListItem title="SpaceX 资讯" />
				<ThreadListItem title="React Hooks 原理" isActive />
			</div>
		</div>
	);
};

const ThreadListItem: FC<{ title: string; isActive?: boolean }> = ({ title, isActive }) => {
	return (
		<div className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition cursor-pointer ${isActive ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}>
			<div className="flex items-center gap-3 overflow-hidden">
				<MessageSquare className="w-4 h-4 opacity-50 shrink-0" />
				<span className="truncate whitespace-nowrap">{title}</span>
			</div>
			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
				<button className="p-1 hover:text-red-500 transition cursor-pointer">
					<X className="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
	);
};

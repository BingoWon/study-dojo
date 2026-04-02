import { Check, MessageSquare, Pencil, Plus, X } from "lucide-react";
import { type FC, useEffect, useRef, useState } from "react";
import type { Thread } from "../lib/useThreads";

export const ThreadListSidebar: FC<{
	threads: Thread[];
	activeThreadId: string | null;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
	onRename: (id: string, title: string) => void;
}> = ({ threads, activeThreadId, onSelect, onCreate, onDelete, onRename }) => {
	return (
		<div className="w-1/6 min-w-[200px] h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col border-r border-zinc-200 dark:border-white/5 transition-all flex-shrink-0 z-40 relative">
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
						onRename={(title) => onRename(t.id, title)}
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
	onRename: (title: string) => void;
}> = ({ title, isActive, onClick, onDelete, onRename }) => {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(title);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!editing) setDraft(title);
	}, [title, editing]);

	useEffect(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

	const save = () => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== title) onRename(trimmed);
		setEditing(false);
	};

	if (editing) {
		return (
			<div className="flex items-center gap-1 rounded-lg px-2 py-1.5 bg-zinc-200 dark:bg-zinc-800">
				<input
					ref={inputRef}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") save();
						if (e.key === "Escape") setEditing(false);
					}}
					onBlur={save}
					className="flex-1 bg-transparent text-sm outline-none text-zinc-900 dark:text-zinc-100 min-w-0"
				/>
				<button
					type="button"
					onMouseDown={(e) => {
						e.preventDefault();
						save();
					}}
					className="p-1 text-emerald-500 hover:text-emerald-400 transition cursor-pointer"
				>
					<Check className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					onMouseDown={(e) => {
						e.preventDefault();
						setEditing(false);
					}}
					className="p-1 text-zinc-400 hover:text-zinc-300 transition cursor-pointer"
				>
					<X className="w-3.5 h-3.5" />
				</button>
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={onClick}
			onDoubleClick={() => setEditing(true)}
			className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition cursor-pointer w-full text-left ${isActive ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
		>
			<div className="flex items-center gap-3 overflow-hidden">
				<MessageSquare className="w-4 h-4 opacity-50 shrink-0" />
				<span className="truncate whitespace-nowrap">{title}</span>
			</div>
			<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
				{/* biome-ignore lint/a11y/useSemanticElements: nested interactive */}
				<span
					role="button"
					tabIndex={-1}
					onClick={(e) => {
						e.stopPropagation();
						setEditing(true);
					}}
					onKeyDown={() => {}}
					className="p-1 hover:text-blue-500 transition cursor-pointer"
				>
					<Pencil className="w-3 h-3" />
				</span>
				{/* biome-ignore lint/a11y/useSemanticElements: nested interactive */}
				<span
					role="button"
					tabIndex={-1}
					onClick={onDelete}
					onKeyDown={() => {}}
					className="p-1 hover:text-red-500 transition cursor-pointer"
				>
					<X className="w-3.5 h-3.5" />
				</span>
			</div>
		</button>
	);
};

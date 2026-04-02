import {
	BookOpen,
	Brain,
	Check,
	FileText,
	Loader2,
	MessageSquare,
	Pencil,
	Plus,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import type { Thread } from "../lib/useThreads";

export type SidebarTab = "chat" | "rag" | "memory";

export const ThreadListSidebar: FC<{
	threads: Thread[];
	activeThreadId: string | null;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
	onRename: (id: string, title: string) => void;
	activeTab: SidebarTab;
	onTabChange: (tab: SidebarTab) => void;
}> = ({
	threads,
	activeThreadId,
	onSelect,
	onCreate,
	onDelete,
	onRename,
	activeTab,
	onTabChange,
}) => {
	return (
		<div className="w-full h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col transition-all z-40 relative">
			{/* Tab 切换 */}
			<div className="flex border-b border-zinc-200 dark:border-zinc-800">
				{(
					[
						{ id: "chat", label: "对话", icon: MessageSquare },
						{ id: "rag", label: "论文", icon: BookOpen },
						{ id: "memory", label: "记忆", icon: Brain },
					] as const
				).map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => onTabChange(tab.id)}
						className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-3 text-xs font-medium transition cursor-pointer ${
							activeTab === tab.id
								? "text-zinc-900 dark:text-zinc-100 border-b-2 border-zinc-900 dark:border-zinc-100"
								: "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400"
						}`}
					>
						<tab.icon className="w-3.5 h-3.5" />
						{tab.label}
					</button>
				))}
			</div>

			{/* Tab 内容 */}
			{activeTab === "chat" && (
				<>
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
				</>
			)}

			{activeTab === "rag" && <PapersPanel />}

			{activeTab === "memory" && (
				<div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
					<Brain className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
					<h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
						记忆 / Memory
					</h3>
					<p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
						AI 的长期记忆，跨对话记住用户偏好和上下文
					</p>
					<p className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-3">
						Mastra Memory
					</p>
				</div>
			)}
		</div>
	);
};

// ── Papers Panel ──────────────────────────────────────────────────────────────

interface Paper {
	id: string;
	title: string;
	chunks: number;
	createdAt: number;
}

const PapersPanel: FC = () => {
	const [papers, setPapers] = useState<Paper[]>([]);
	const [uploading, setUploading] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	const fetchPapers = useCallback(async () => {
		try {
			const res = await fetch("/api/papers");
			if (res.ok) setPapers(await res.json());
		} catch {
			/* ignore */
		}
	}, []);

	useEffect(() => {
		fetchPapers();
	}, [fetchPapers]);

	const handleUpload = async (file: File) => {
		if (!file.name.endsWith(".pdf")) return;
		setUploading(true);
		try {
			const form = new FormData();
			form.append("file", file);
			form.append("title", file.name.replace(/\.pdf$/i, ""));
			const res = await fetch("/api/papers", { method: "POST", body: form });
			if (res.ok) await fetchPapers();
		} finally {
			setUploading(false);
		}
	};

	const handleDelete = async (id: string) => {
		await fetch(`/api/papers/${id}`, { method: "DELETE" });
		setPapers((prev) => prev.filter((p) => p.id !== id));
	};

	const onDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const file = e.dataTransfer.files[0];
		if (file) handleUpload(file);
	};

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			{/* 上传区域 */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: drop zone */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone */}
			<div
				onClick={() => fileRef.current?.click()}
				onDrop={onDrop}
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				className={`m-3 p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center gap-2 ${
					dragOver
						? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
						: "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600"
				}`}
			>
				{uploading ? (
					<Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
				) : (
					<Upload className="w-5 h-5 text-zinc-400" />
				)}
				<span className="text-xs text-zinc-500 dark:text-zinc-400">
					{uploading ? "上传中..." : "拖拽或点击上传 PDF"}
				</span>
				<input
					ref={fileRef}
					type="file"
					accept=".pdf"
					className="hidden"
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) handleUpload(file);
						e.target.value = "";
					}}
				/>
			</div>

			{/* 论文列表 */}
			<div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-1">
				{papers.length === 0 && !uploading && (
					<p className="text-center text-xs text-zinc-400 dark:text-zinc-600 mt-4">
						暂无论文
					</p>
				)}
				{papers.map((p) => (
					<div
						key={p.id}
						className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
					>
						<div className="flex items-center gap-2 overflow-hidden min-w-0">
							<FileText className="w-4 h-4 text-zinc-400 shrink-0" />
							<div className="min-w-0">
								<div className="truncate text-zinc-700 dark:text-zinc-300 font-medium">
									{p.title}
								</div>
								<div className="text-[10px] text-zinc-400 dark:text-zinc-600">
									{p.chunks} 个片段
								</div>
							</div>
						</div>
						<button
							type="button"
							onClick={() => handleDelete(p.id)}
							className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition cursor-pointer"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</div>
				))}
			</div>
		</div>
	);
};

// ── Thread List Item ─────────────────────────────────────────────────────────

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

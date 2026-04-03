import {
	BookOpen,
	Check,
	FileText,
	Loader2,
	MessageSquare,
	Pencil,
	Plus,
	Upload,
	X,
} from "lucide-react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import type { Thread } from "../lib/useThreads";

export type SidebarTab = "chat" | "rag";

export const ThreadListSidebar: FC<{
	threads: Thread[];
	activeThreadId: string | null;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
	onRename: (id: string, title: string) => void;
	activeTab: SidebarTab;
	onTabChange: (tab: SidebarTab) => void;
	onPaperSelect?: (
		paperId: string,
		title: string,
		lang?: string | null,
	) => void;
}> = ({
	threads,
	activeThreadId,
	onSelect,
	onCreate,
	onDelete,
	onRename,
	activeTab,
	onTabChange,
	onPaperSelect,
}) => {
	return (
		<div className="w-full h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col transition-all z-40 relative">
			{/* Tab 切换 */}
			<div className="flex border-b border-zinc-200 dark:border-zinc-800">
				{(
					[
						{ id: "chat", label: "对话", icon: MessageSquare },
						{ id: "rag", label: "论文", icon: BookOpen },
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

			{activeTab === "rag" && <PapersPanel onPaperSelect={onPaperSelect} />}
		</div>
	);
};

// ── Papers Panel ──────────────────────────────────────────────────────────────

function timeAgo(unixSeconds: number): string {
	const diff = Math.floor(Date.now() / 1000) - unixSeconds;
	if (diff < 60) return "刚刚";
	if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
	if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
	if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
	if (diff < 2592000) return `${Math.floor(diff / 604800)} 周前`;
	const d = new Date(unixSeconds * 1000);
	return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

interface Paper {
	id: string;
	title: string;
	chunks: number;
	status: string;
	lang?: string | null;
	createdAt: number;
}

const PLACEHOLDER_TITLE = "等待解析后自动生成标题…";

const PapersPanel: FC<{
	onPaperSelect?: (
		paperId: string,
		title: string,
		lang?: string | null,
	) => void;
}> = ({ onPaperSelect }) => {
	const [papers, setPapers] = useState<Paper[]>([]);
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

	const updatePaperStatus = useCallback(
		(paperId: string, status: string, extra?: Partial<Paper>) => {
			setPapers((prev) =>
				prev.map((p) => (p.id === paperId ? { ...p, status, ...extra } : p)),
			);
		},
		[],
	);

	const handleUpload = async (file: File) => {
		if (!file.name.endsWith(".pdf")) return;

		const buffer = await file.arrayBuffer();

		// Frontend hash precheck
		const digest = await crypto.subtle.digest("SHA-256", buffer);
		const hash = [...new Uint8Array(digest)]
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		try {
			const checkRes = await fetch(
				`/api/papers/check?hash=${encodeURIComponent(hash)}`,
			);
			if (checkRes.ok) {
				const check = (await checkRes.json()) as {
					exists: boolean;
					paperId?: string;
				};
				if (check.exists) {
					await fetchPapers();
					return;
				}
			}
		} catch {
			/* proceed with upload */
		}

		// Add placeholder item immediately
		const tempId = crypto.randomUUID() as string;
		setPapers((prev) => [
			{
				id: tempId,
				title: PLACEHOLDER_TITLE,
				chunks: 0,
				status: "uploading",
				createdAt: Math.floor(Date.now() / 1000),
			},
			...prev,
		]);

		// Upload with SSE progress
		const form = new FormData();
		form.append("file", file);

		try {
			const res = await fetch("/api/papers", { method: "POST", body: form });
			if (!res.ok || !res.body) {
				updatePaperStatus(tempId, "failed");
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buf = "";
			let realPaperId = tempId;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });

				const lines = buf.split("\n");
				buf = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					try {
						const data = JSON.parse(line.slice(6)) as {
							status: string;
							paperId?: string;
							chunks?: number;
							lang?: string;
							duplicate?: boolean;
						};

						// Map real paperId on first event
						if (data.paperId && realPaperId === tempId) {
							realPaperId = data.paperId;
							setPapers((prev) =>
								prev.map((p) =>
									p.id === tempId ? { ...p, id: realPaperId } : p,
								),
							);
						}

						if (data.duplicate) {
							// Dedup hit — remove placeholder, refetch
							setPapers((prev) => prev.filter((p) => p.id !== realPaperId));
							await fetchPapers();
							return;
						}

						updatePaperStatus(realPaperId, data.status, {
							chunks: data.chunks ?? 0,
							lang: data.lang,
						});

						// Generate title when ready
						if (data.status === "ready") {
							try {
								const titleRes = await fetch(
									`/api/papers/${realPaperId}/generate-title`,
									{ method: "POST" },
								);
								if (titleRes.ok) {
									const { title } = (await titleRes.json()) as {
										title: string;
									};
									if (title) {
										updatePaperStatus(realPaperId, "ready", { title });
									}
								}
							} catch {
								/* best-effort */
							}
						}
					} catch {
						/* skip malformed SSE */
					}
				}
			}
		} catch {
			updatePaperStatus(tempId, "failed");
		}
	};

	const handleUnlink = async (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		await fetch(`/api/papers/${id}`, { method: "DELETE" });
		setPapers((prev) => prev.filter((p) => p.id !== id));
	};

	const handleRename = async (id: string, title: string) => {
		setPapers((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
		await fetch(`/api/papers/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title }),
		});
	};

	const onDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const file = e.dataTransfer.files[0];
		if (file) handleUpload(file);
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: full area drop zone
		// biome-ignore lint/a11y/noStaticElementInteractions: full area drop zone
		<div
			className={`flex-1 flex flex-col overflow-hidden transition-colors ${
				dragOver ? "bg-blue-50 dark:bg-blue-900/10" : ""
			}`}
			onDrop={onDrop}
			onDragOver={(e) => {
				e.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node)) {
					setDragOver(false);
				}
			}}
			onClick={() => fileRef.current?.click()}
		>
			{/* 视觉指引区 */}
			<div
				className={`m-3 p-4 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-2 pointer-events-none ${
					dragOver
						? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
						: "border-zinc-300 dark:border-zinc-700"
				}`}
			>
				<Upload className="w-5 h-5 text-zinc-400" />
				<span className="text-xs text-zinc-500 dark:text-zinc-400">
					拖拽或点击上传 PDF
				</span>
			</div>

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

			{/* 论文列表 */}
			<div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-1 pointer-events-auto">
				{papers.length === 0 && (
					<p className="text-center text-xs text-zinc-400 dark:text-zinc-600 mt-4 pointer-events-none">
						暂无论文
					</p>
				)}
				{papers.map((p) => (
					<PaperListItem
						key={p.id}
						paper={p}
						onClick={() => {
							if (p.status === "ready") onPaperSelect?.(p.id, p.title, p.lang);
						}}
						onUnlink={(e) => handleUnlink(p.id, e)}
						onRename={(title) => handleRename(p.id, title)}
					/>
				))}
			</div>
		</div>
	);
};

// ── Progress Bar ─────────────────────────────────────────────────────────────

const STEPS_ZH = ["上传", "解析", "分块", "嵌入"];
const STEPS_EN = ["上传", "解析", "翻译", "分块", "嵌入"];

function getSteps(lang?: string | null): string[] {
	return lang === "en" ? STEPS_EN : STEPS_ZH;
}

function stepIndex(status: string, lang?: string | null): number {
	const map: Record<string, number> = {
		uploading: 0,
		parsing: 1,
	};
	if (lang === "en") {
		map.translating = 2;
		map.chunking = 3;
		map.embedding = 4;
	} else {
		map.chunking = 2;
		map.embedding = 3;
	}
	return map[status] ?? -1;
}

const ProgressBar: FC<{ status: string; lang?: string | null }> = ({
	status,
	lang,
}) => {
	const steps = getSteps(lang);
	const active = stepIndex(status, lang);

	return (
		<div className="flex items-center gap-1 mt-1 w-full">
			{steps.map((label, i) => {
				const done = i < active;
				const current = i === active;
				return (
					<div key={label} className="flex items-center gap-1 flex-1 min-w-0">
						{i > 0 && (
							<div
								className={`h-px flex-1 ${done ? "bg-blue-400" : "bg-zinc-200 dark:bg-zinc-800"}`}
							/>
						)}
						<span
							className={`text-[10px] whitespace-nowrap transition-colors ${
								current
									? "text-blue-500 dark:text-blue-400 font-semibold"
									: done
										? "text-emerald-500 dark:text-emerald-400"
										: "text-zinc-400 dark:text-zinc-600"
							}`}
						>
							{done ? "✓" : current ? "●" : "○"} {label}
						</span>
					</div>
				);
			})}
		</div>
	);
};

// ── Paper List Item ──────────────────────────────────────────────────────────

const PaperListItem: FC<{
	paper: Paper;
	onClick: () => void;
	onUnlink: (e: React.MouseEvent) => void;
	onRename: (title: string) => void;
}> = ({ paper: p, onClick, onUnlink, onRename }) => {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(p.title);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!editing) setDraft(p.title);
	}, [p.title, editing]);

	useEffect(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

	const save = () => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== p.title) onRename(trimmed);
		setEditing(false);
	};

	if (editing) {
		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: editing stop propagation
			// biome-ignore lint/a11y/useKeyWithClickEvents: editing stop propagation
			<div
				className="flex items-center gap-1 rounded-lg px-2 py-1.5 bg-zinc-200 dark:bg-zinc-800"
				onClick={(e) => e.stopPropagation()}
			>
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
		// biome-ignore lint/a11y/useKeyWithClickEvents: paper click
		// biome-ignore lint/a11y/noStaticElementInteractions: paper click
		<div
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			onDoubleClick={() => p.status === "ready" && setEditing(true)}
			className={`group w-full rounded-lg px-3 py-2.5 text-sm transition ${
				p.status === "ready"
					? "hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
					: p.status === "failed"
						? "opacity-50"
						: ""
			}`}
		>
			<div className="flex items-center gap-2 w-full">
				{p.status === "ready" ? (
					<FileText className="w-4 h-4 text-zinc-400 shrink-0" />
				) : p.status === "failed" ? (
					<FileText className="w-4 h-4 text-red-400 shrink-0" />
				) : (
					<Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
				)}
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<span className="truncate text-zinc-700 dark:text-zinc-300 font-medium">
							{p.title}
						</span>
						<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
							{p.status === "ready" && (
								// biome-ignore lint/a11y/useSemanticElements: nested interactive
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
							)}
							{/* biome-ignore lint/a11y/useSemanticElements: nested interactive */}
							<span
								role="button"
								tabIndex={-1}
								onClick={(e) => {
									e.stopPropagation();
									onUnlink(e);
								}}
								onKeyDown={() => {}}
								className="p-1 hover:text-red-500 transition cursor-pointer"
							>
								<X className="w-3.5 h-3.5" />
							</span>
						</div>
					</div>
					{p.status === "ready" ? (
						<div className="flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-600">
							<span>{p.chunks} 个片段</span>
							<span>{timeAgo(p.createdAt)}</span>
						</div>
					) : p.status === "failed" ? (
						<div className="text-[10px] text-red-400">解析失败</div>
					) : (
						<ProgressBar status={p.status} lang={p.lang} />
					)}
				</div>
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

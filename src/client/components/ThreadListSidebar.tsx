import {
	IconFileTypeBmp,
	IconFileTypeDoc,
	IconFileTypeDocx,
	IconFileTypeJpg,
	IconFileTypePdf,
	IconFileTypePng,
	IconFileTypeTxt,
} from "@tabler/icons-react";
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
import {
	type FC,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { Thread } from "../lib/useThreads";

export type SidebarTab = "chat" | "rag";

export const ThreadListSidebar: FC<{
	threads: Thread[];
	activeThreadId: string | null;
	activePaperId: string | null;
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
	activePaperId,
	onSelect,
	onCreate,
	onDelete,
	onRename,
	activeTab,
	onTabChange,
	onPaperSelect,
}) => {
	return (
		<div className="w-full h-full flex flex-col transition-all z-40 relative">
			{/* Tab 切换 */}
			<div className="flex border-b border-zinc-200/50 dark:border-zinc-700/50">
				{(
					[
						{ id: "chat", label: "对话", icon: MessageSquare },
						{ id: "rag", label: "资料", icon: BookOpen },
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

			{activeTab === "rag" && (
				<PapersPanel
					activePaperId={activePaperId}
					onPaperSelect={onPaperSelect}
				/>
			)}
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
	fileExt?: string | null;
	createdAt: number;
}

const PLACEHOLDER_TITLE = "等待解析后自动生成标题…";

const FILE_ICONS: Record<string, FC<{ className?: string }>> = {
	pdf: IconFileTypePdf,
	png: IconFileTypePng,
	jpg: IconFileTypeJpg,
	jpeg: IconFileTypeJpg,
	bmp: IconFileTypeBmp,
	doc: IconFileTypeDoc,
	docx: IconFileTypeDocx,
	txt: IconFileTypeTxt,
	md: IconFileTypeTxt,
	markdown: IconFileTypeTxt,
};

function getFileIcon(ext?: string | null): FC<{ className?: string }> {
	return FILE_ICONS[ext ?? ""] ?? FileText;
}

const PapersPanel: FC<{
	activePaperId: string | null;
	onPaperSelect?: (
		paperId: string,
		title: string,
		lang?: string | null,
	) => void;
}> = ({ activePaperId, onPaperSelect }) => {
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
		const SUPPORTED = [
			".pdf",
			".png",
			".jpg",
			".jpeg",
			".webp",
			".txt",
			".md",
			".docx",
		];
		if (!SUPPORTED.some((e) => file.name.toLowerCase().endsWith(e))) return;

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
				fileExt: file.name.split(".").pop()?.toLowerCase(),
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
							fileName?: string;
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
									{
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({ fileName: data.fileName }),
									},
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
					拖拽或点击上传文件
				</span>
			</div>

			<input
				ref={fileRef}
				type="file"
				accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.docx"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) handleUpload(file);
					e.target.value = "";
				}}
			/>

			{/* 资料列表 */}
			<div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-1 pointer-events-auto">
				{papers.length === 0 && (
					<p className="text-center text-xs text-zinc-400 dark:text-zinc-600 mt-4 pointer-events-none">
						暂无资料
					</p>
				)}
				{papers.map((p) => (
					<PaperListItem
						key={p.id}
						paper={p}
						isActive={p.id === activePaperId}
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

const STEPS = ["上传", "解析", "翻译", "分块", "嵌入"];
const STATUS_TO_STEP: Record<string, number> = {
	uploading: 0,
	parsing: 1,
	translating: 2,
	chunking: 3,
	embedding: 4,
};

const ProgressBar: FC<{ status: string }> = ({ status }) => {
	const active = STATUS_TO_STEP[status] ?? -1;

	const items = STEPS.flatMap((label, i) => {
		const done = i < active;
		const current = i === active;
		const stepEl = (
			<span
				key={label}
				className={`text-[10px] whitespace-nowrap ${
					done
						? "text-emerald-500 dark:text-emerald-400"
						: current
							? "text-blue-500 dark:text-blue-400 font-semibold"
							: "text-zinc-300 dark:text-zinc-700"
				}`}
			>
				{done ? "✓" : current ? "●" : "○"} {label}
			</span>
		);
		if (i === 0) return [stepEl];
		return [
			<div
				key={`line-${label}`}
				className={`flex-1 h-px mx-1 ${done ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-800"}`}
			/>,
			stepEl,
		];
	});

	return <div className="flex items-center mt-1 w-full">{items}</div>;
};

// ── Shared Inline Edit ──────────────────────────────────────────────────────

const InlineEdit: FC<{
	icon: ReactNode;
	value: string;
	onSave: (value: string) => void;
	onCancel: () => void;
}> = ({ icon, value, onSave, onCancel }) => {
	const [draft, setDraft] = useState(value);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	const save = () => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== value) onSave(trimmed);
		onCancel();
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: editing container
		// biome-ignore lint/a11y/useKeyWithClickEvents: editing container
		<div
			className="flex items-center gap-2 w-full rounded-lg px-3 py-2.5 bg-zinc-200 dark:bg-zinc-800"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="shrink-0 opacity-50">{icon}</div>
			<input
				ref={inputRef}
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") save();
					if (e.key === "Escape") onCancel();
				}}
				onBlur={save}
				className="flex-1 bg-transparent text-sm font-medium outline-none text-zinc-900 dark:text-zinc-100 min-w-0"
			/>
			<button
				type="button"
				onMouseDown={(e) => {
					e.preventDefault();
					save();
				}}
				className="p-0.5 text-emerald-500 hover:text-emerald-400 transition cursor-pointer shrink-0"
			>
				<Check className="w-3.5 h-3.5" />
			</button>
			<button
				type="button"
				onMouseDown={(e) => {
					e.preventDefault();
					onCancel();
				}}
				className="p-0.5 text-zinc-400 hover:text-zinc-300 transition cursor-pointer shrink-0"
			>
				<X className="w-3.5 h-3.5" />
			</button>
		</div>
	);
};

// ── Shared Action Buttons ───────────────────────────────────────────────────

const ItemActions: FC<{
	onEdit?: () => void;
	onRemove: (e: React.MouseEvent) => void;
}> = ({ onEdit, onRemove }) => (
	<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
		{onEdit && (
			// biome-ignore lint/a11y/useSemanticElements: nested interactive
			<span
				role="button"
				tabIndex={-1}
				onClick={(e) => {
					e.stopPropagation();
					onEdit();
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
				onRemove(e);
			}}
			onKeyDown={() => {}}
			className="p-1 hover:text-red-500 transition cursor-pointer"
		>
			<X className="w-3.5 h-3.5" />
		</span>
	</div>
);

// ── Shared item style ───────────────────────────────────────────────────────

const ITEM_BASE =
	"group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition cursor-pointer w-full text-left";
const ITEM_ACTIVE =
	"bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900";
const ITEM_IDLE =
	"text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900";

// ── Paper List Item ──────────────────────────────────────────────────────────

const PaperListItem: FC<{
	paper: Paper;
	isActive: boolean;
	onClick: () => void;
	onUnlink: (e: React.MouseEvent) => void;
	onRename: (title: string) => void;
}> = ({ paper: p, isActive, onClick, onUnlink, onRename }) => {
	const [editing, setEditing] = useState(false);

	const FileIcon = getFileIcon(p.fileExt);
	const icon =
		p.status === "ready" ? (
			<FileIcon className="w-4 h-4" />
		) : p.status === "failed" ? (
			<FileIcon className="w-4 h-4 text-red-400" />
		) : (
			<Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
		);

	if (editing) {
		return (
			<InlineEdit
				icon={icon}
				value={p.title}
				onSave={onRename}
				onCancel={() => setEditing(false)}
			/>
		);
	}

	const isReady = p.status === "ready";

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: paper click
		// biome-ignore lint/a11y/noStaticElementInteractions: paper click
		<div
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			onDoubleClick={() => isReady && setEditing(true)}
			className={`${ITEM_BASE} ${
				!isReady
					? p.status === "failed"
						? "opacity-50 text-zinc-500"
						: "text-zinc-500 dark:text-zinc-400"
					: isActive
						? ITEM_ACTIVE
						: ITEM_IDLE
			}`}
		>
			<div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
				<div className="shrink-0 opacity-60">{icon}</div>
				<div className="min-w-0 flex-1">
					<span className="block truncate">{p.title}</span>
					{isReady ? (
						<div className="flex items-center justify-between text-[10px] opacity-60 font-normal">
							<span>{p.chunks} 个片段</span>
							<span>{timeAgo(p.createdAt)}</span>
						</div>
					) : p.status === "failed" ? (
						<div className="text-[10px] text-red-400 font-normal">解析失败</div>
					) : (
						<ProgressBar status={p.status} />
					)}
				</div>
			</div>
			{isReady && (
				<ItemActions onEdit={() => setEditing(true)} onRemove={onUnlink} />
			)}
			{!isReady && <ItemActions onRemove={onUnlink} />}
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

	if (editing) {
		return (
			<InlineEdit
				icon={<MessageSquare className="w-4 h-4" />}
				value={title}
				onSave={onRename}
				onCancel={() => setEditing(false)}
			/>
		);
	}

	return (
		<button
			type="button"
			onClick={onClick}
			onDoubleClick={() => setEditing(true)}
			className={`${ITEM_BASE} ${isActive ? ITEM_ACTIVE : ITEM_IDLE}`}
		>
			<div className="flex items-center gap-2 overflow-hidden">
				<MessageSquare className="w-4 h-4 opacity-50 shrink-0" />
				<span className="truncate">{title}</span>
			</div>
			<ItemActions onEdit={() => setEditing(true)} onRemove={onDelete} />
		</button>
	);
};

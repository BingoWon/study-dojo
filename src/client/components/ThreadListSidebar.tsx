import {
	ThreadListItemPrimitive,
	ThreadListPrimitive,
	useAui,
	useAuiState,
} from "@assistant-ui/react";
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
import {
	type FC,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

export type SidebarTab = "chat" | "library" | "memory";

export const ThreadListSidebar: FC<{
	activePaperId: string | null;
	activeTab: SidebarTab;
	onTabChange: (tab: SidebarTab) => void;
	onPaperSelect?: (
		paperId: string,
		title: string,
		lang?: string | null,
		fileExt?: string | null,
	) => void;
}> = ({ activePaperId, activeTab, onTabChange, onPaperSelect }) => {
	return (
		<div className="w-full h-full flex flex-col transition-all z-40 relative">
			{/* Tab 切换 */}
			<div className="flex border-b border-zinc-200/50 dark:border-zinc-700/50">
				{(
					[
						{ id: "chat", label: "对话", icon: MessageSquare },
						{ id: "library", label: "资料", icon: BookOpen },
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
				<PapersPanel
					activePaperId={activePaperId}
					onPaperSelect={onPaperSelect}
				/>
			)}

			{activeTab === "memory" && <MemoryPanel />}
		</div>
	);
};

// ── Runtime-backed Thread Item ──────────────────────────────────────────────

const RuntimeThreadItem: FC = () => {
	const aui = useAui();
	const [editing, setEditing] = useState(false);
	const title = useAuiState((s) => s.threadListItem.title) || "新对话";
	const id = useAuiState((s) => s.threadListItem.id);
	const mainThreadId = useAuiState((s) => s.threads.mainThreadId);
	const isActive = id === mainThreadId;

	if (editing) {
		return (
			<ThreadListItemPrimitive.Root className="w-full">
				<InlineEdit
					icon={<MessageSquare className="w-4 h-4" />}
					value={title}
					onSave={(newTitle) => aui.threadListItem().rename(newTitle)}
					onCancel={() => setEditing(false)}
				/>
			</ThreadListItemPrimitive.Root>
		);
	}

	return (
		<ThreadListItemPrimitive.Root
			className={`relative ${ITEM_BASE} ${isActive ? ITEM_ACTIVE : ITEM_IDLE}`}
		>
			{/* Trigger covers the full row as click target */}
			<ThreadListItemPrimitive.Trigger
				className="absolute inset-0 cursor-pointer"
				onDoubleClick={() => setEditing(true)}
			/>
			<div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 pointer-events-none">
				<MessageSquare className="w-4 h-4 opacity-50 shrink-0" />
				<span className="truncate">
					<ThreadListItemPrimitive.Title fallback="新��话" />
				</span>
			</div>
			<div className="relative z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
				<span
					role="button"
					tabIndex={-1}
					onClick={(e) => {
						e.stopPropagation();
						setEditing(true);
					}}
					onKeyDown={() => {}}
					className="p-1 hover:text-blue-500 transition cursor-pointer pointer-events-auto"
				>
					<Pencil className="w-3 h-3" />
				</span>
				<ThreadListItemPrimitive.Delete asChild>
					<span
						role="button"
						tabIndex={-1}
						className="p-1 hover:text-red-500 transition cursor-pointer pointer-events-auto"
					>
						<X className="w-3.5 h-3.5" />
					</span>
				</ThreadListItemPrimitive.Delete>
			</div>
		</ThreadListItemPrimitive.Root>
	);
};

// ── Memory Panel ─────────────────────────────────────────────────────────────

interface MemoryItem {
	id: string;
	memory: string;
	categories?: string[];
	created_at: string;
	updated_at: string;
}

const MemoryPanel: FC = () => {
	const [memories, setMemories] = useState<MemoryItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [unavailable, setUnavailable] = useState(false);
	const [draft, setDraft] = useState("");
	const [adding, setAdding] = useState(false);

	const fetchMemories = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/memories");
			if (res.status === 503) {
				setUnavailable(true);
				return;
			}
			if (res.ok) setMemories(await res.json());
		} catch {
			/* ignore */
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchMemories();
	}, [fetchMemories]);

	const handleAdd = async () => {
		const text = draft.trim();
		if (!text || adding || unavailable) return;
		setAdding(true);
		setDraft("");
		try {
			await fetch("/api/memories", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text }),
			});
			await fetchMemories();
		} catch {
			/* ignore */
		} finally {
			setAdding(false);
		}
	};

	const handleDelete = async (id: string) => {
		setMemories((prev) => prev.filter((m) => m.id !== id));
		await fetch(`/api/memories/${id}`, { method: "DELETE" });
	};

	// Service unavailable
	if (unavailable) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center py-8 text-center px-4">
				<Brain className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
				<p className="text-xs text-zinc-400 dark:text-zinc-600">
					记忆服务未配置
				</p>
				<p className="text-[10px] text-zinc-400/60 dark:text-zinc-600/60 mt-1 max-w-[180px]">
					请在服务端配置 MEM0_API_KEY 以启用长期记忆功能
				</p>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			{/* Add memory input */}
			<div className="m-3 flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<input
						type="text"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleAdd()}
						placeholder="添加记忆，如：我不吃辣"
						className="flex-1 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2 outline-none text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 border border-transparent focus:border-zinc-300 dark:focus:border-zinc-600 transition"
					/>
					<button
						type="button"
						onClick={handleAdd}
						disabled={!draft.trim() || adding}
						className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 transition cursor-pointer disabled:cursor-not-allowed"
					>
						{adding ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Plus className="w-3.5 h-3.5" />
						)}
					</button>
				</div>
				<span className="text-[10px] text-zinc-400 dark:text-zinc-600">
					{loading ? "加载中..." : `${memories.length} 条记忆`}
				</span>
			</div>

			<div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-1">
				{!loading && memories.length === 0 && (
					<div className="flex flex-col items-center justify-center py-8 text-center">
						<Brain className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
						<p className="text-xs text-zinc-400 dark:text-zinc-600">
							暂无记忆
						</p>
						<p className="text-[10px] text-zinc-400/60 dark:text-zinc-600/60 mt-1 max-w-[180px]">
							对话时自动提取，或在上方手动添加
						</p>
					</div>
				)}
				{memories.map((m) => (
					<div
						key={m.id}
						className="group flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
					>
						<div className="min-w-0 flex-1">
							<p className="text-zinc-700 dark:text-zinc-300 text-xs leading-relaxed">
								{m.memory}
							</p>
							<div className="flex items-center gap-2 mt-1">
								{m.categories?.map((cat) => (
									<span
										key={cat}
										className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
									>
										{cat}
									</span>
								))}
								<span className="text-[9px] text-zinc-400 dark:text-zinc-600">
									{timeAgo(
										Math.floor(
											new Date(m.updated_at).getTime() / 1000,
										),
									)}
								</span>
							</div>
						</div>
						<button
							type="button"
							onClick={() => handleDelete(m.id)}
							className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition cursor-pointer shrink-0"
						>
							<Trash2 className="w-3 h-3" />
						</button>
					</div>
				))}
			</div>
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
		fileExt?: string | null,
	) => void;
}> = ({ activePaperId, onPaperSelect }) => {
	const [papers, setPapers] = useState<Paper[]>([]);
	const [dragOver, setDragOver] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	// Ctrl/Cmd+V paste upload
	useEffect(() => {
		const el = panelRef.current;
		if (!el) return;
		const handler = (e: ClipboardEvent) => {
			const file = e.clipboardData?.files[0];
			if (file) handleUpload(file);
		};
		el.addEventListener("paste", handler);
		return () => el.removeEventListener("paste", handler);
	});

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
										body: JSON.stringify({
											fileName: data.fileName,
											fileExt: file.name.split(".").pop()?.toLowerCase(),
										}),
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
			ref={panelRef}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: paste target
			tabIndex={0}
			className={`flex-1 flex flex-col overflow-hidden transition-colors outline-none ${
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
					拖拽、点击或粘贴上传
				</span>
				<span className="text-[10px] text-zinc-400 dark:text-zinc-600">
					PDF · 图片 · TXT · MD · DOCX
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
					<div className="flex flex-col items-center justify-center py-8 text-center pointer-events-none">
						<BookOpen className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
						<p className="text-xs text-zinc-400 dark:text-zinc-600">
							暂无资料
						</p>
						<p className="text-[10px] text-zinc-400/60 dark:text-zinc-600/60 mt-1 max-w-[180px]">
							拖拽、点击或粘贴上传文件到上方区域
						</p>
					</div>
				)}
				{papers.map((p) => (
					<PaperListItem
						key={p.id}
						paper={p}
						isActive={p.id === activePaperId}
						onClick={() => {
							if (p.status === "ready")
								onPaperSelect?.(p.id, p.title, p.lang, p.fileExt);
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
			<FileIcon className="w-5 h-5" />
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

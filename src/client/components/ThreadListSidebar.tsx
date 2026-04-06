import {
	ThreadListItemPrimitive,
	ThreadListPrimitive,
	useAui,
	useAuiState,
} from "@assistant-ui/react";
import { UserButton, useUser } from "@clerk/react";
import {
	BookOpen,
	Brain,
	Check,
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
import { getFileIcon } from "../lib/file-icons";
import { ThemeToggle } from "./ThemeToggle";

export type SidebarTab = "chat" | "library" | "memory";

// ── Shared Constants ────────────────────────────────────────────────────────

const CACHE_KEYS = {
	library: "cache:documents",
	memory: "cache:memories",
} as const;

const MEMORY_POLL_INTERVAL = 30_000; // 30s

// ── Shared Components ───────────────────────────────────────────────────────

const EmptyState: FC<{
	icon: ReactNode;
	title: string;
	subtitle: string;
}> = ({ icon, title, subtitle }) => (
	<div className="flex flex-col items-center justify-center py-8 text-center pointer-events-none">
		<div className="mb-2 text-zinc-300 dark:text-zinc-700">{icon}</div>
		<p className="text-xs text-zinc-400 dark:text-zinc-600">{title}</p>
		<p className="text-[10px] text-zinc-400/60 dark:text-zinc-600/60 mt-1 max-w-[180px]">
			{subtitle}
		</p>
	</div>
);

const CenteredLoader: FC = () => (
	<div className="flex flex-1 items-center justify-center py-8">
		<Loader2 className="h-5 w-5 animate-spin text-zinc-300 dark:text-zinc-600" />
	</div>
);

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

/** Unified action buttons: edit pencil + red trash */
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
				className="p-1 text-zinc-400 hover:text-blue-500 transition cursor-pointer"
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
			className="p-1 text-zinc-400 hover:text-red-500 transition cursor-pointer"
		>
			<Trash2 className="w-3 h-3" />
		</span>
	</div>
);

// ── Shared Item Styles ──────────────────────────────────────────────────────

const ITEM_BASE =
	"group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition cursor-pointer w-full text-left";
const ITEM_ACTIVE =
	"bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900";
const ITEM_IDLE =
	"text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900";

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function readCache<T>(key: string): T | null {
	try {
		const raw = sessionStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function writeCache(key: string, data: unknown) {
	try {
		sessionStorage.setItem(key, JSON.stringify(data));
	} catch {
		/* quota exceeded, ignore */
	}
}

// ── Main Sidebar ────────────────────────────────────────────────────────────

export const ThreadListSidebar: FC<{
	activeDocId: string | null;
	activeTab: SidebarTab;
	onTabChange: (tab: SidebarTab) => void;
	onDocSelect?: (
		docId: string,
		title: string,
		lang?: string | null,
		fileExt?: string | null,
	) => void;
}> = ({ activeDocId, activeTab, onTabChange, onDocSelect }) => (
	<div className="w-full h-full flex flex-col transition-all z-40 relative">
		{/* Tab 切换 */}
		<div className="flex border-b border-divider dark:border-divider-dark">
			{(
				[
					{ id: "chat", label: "对话", icon: MessageSquare },
					{ id: "library", label: "文档", icon: BookOpen },
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
			<DocumentsPanel activeDocId={activeDocId} onDocSelect={onDocSelect} />
		)}

		{activeTab === "memory" && <MemoryPanel />}

		{/* User section at bottom */}
		<SidebarUserSection />
	</div>
);

// ── User Section (sidebar bottom) ───────────────────────────────────────────

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
			<ThreadListItemPrimitive.Trigger
				className="absolute inset-0 cursor-pointer"
				onDoubleClick={() => setEditing(true)}
			/>
			<div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 pointer-events-none">
				<MessageSquare className="w-4 h-4 opacity-50 shrink-0" />
				<span className="truncate">
					<ThreadListItemPrimitive.Title fallback="新对话" />
				</span>
			</div>
			<div className="relative z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
				<button
					type="button"
					tabIndex={-1}
					onClick={(e) => {
						e.stopPropagation();
						setEditing(true);
					}}
					className="p-1 text-zinc-400 hover:text-blue-500 transition cursor-pointer pointer-events-auto"
				>
					<Pencil className="w-3 h-3" />
				</button>
				<ThreadListItemPrimitive.Delete asChild>
					<button
						type="button"
						tabIndex={-1}
						className="p-1 text-zinc-400 hover:text-red-500 transition cursor-pointer pointer-events-auto"
					>
						<Trash2 className="w-3 h-3" />
					</button>
				</ThreadListItemPrimitive.Delete>
			</div>
		</ThreadListItemPrimitive.Root>
	);
};

// ── Memory Panel ────────────────────────────────────────────────────────────

interface MemoryItem {
	id: string;
	memory: string;
	categories?: string[] | null;
	created_at: string;
	updated_at: string;
}

const MemoryPanel: FC = () => {
	const [memories, setMemories] = useState<MemoryItem[]>(
		() => readCache<MemoryItem[]>(CACHE_KEYS.memory) ?? [],
	);
	const [loading, setLoading] = useState(true);
	const [unavailable, setUnavailable] = useState(false);
	const [draft, setDraft] = useState("");
	const [adding, setAdding] = useState(false);

	const fetchMemories = useCallback(async (showLoader = true) => {
		if (showLoader) setLoading(true);
		try {
			const res = await fetch("/api/memories");
			if (res.status === 503) {
				setUnavailable(true);
				return;
			}
			if (res.ok) {
				const data = await res.json();
				setMemories(data as MemoryItem[]);
				writeCache(CACHE_KEYS.memory, data);
			}
		} catch {
			/* ignore */
		} finally {
			setLoading(false);
		}
	}, []);

	// Initial fetch + polling
	useEffect(() => {
		fetchMemories();
		const interval = setInterval(
			() => fetchMemories(false),
			MEMORY_POLL_INTERVAL,
		);
		return () => clearInterval(interval);
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
			// Mem0 processes async; poll after a delay
			setTimeout(() => fetchMemories(false), 3000);
		} catch {
			/* ignore */
		} finally {
			setAdding(false);
		}
	};

	const handleDelete = async (id: string) => {
		setMemories((prev) => {
			const next = prev.filter((m) => m.id !== id);
			writeCache(CACHE_KEYS.memory, next);
			return next;
		});
		await fetch(`/api/memories/${id}`, { method: "DELETE" });
	};

	if (unavailable) {
		return (
			<EmptyState
				icon={<Brain className="w-8 h-8" />}
				title="记忆服务未配置"
				subtitle="请在服务端配置 MEM0_API_KEY 以启用长期记忆功能"
			/>
		);
	}

	// Show cache immediately, loader only if cache is empty
	const showLoader = loading && memories.length === 0;

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			{/* Add memory input */}
			<div className="p-3">
				<div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-2 border border-transparent focus-within:border-zinc-300 dark:focus-within:border-zinc-600 transition">
					<input
						type="text"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleAdd()}
						placeholder="添加记忆，如：我喜欢你讲大白话"
						className="flex-1 text-sm bg-transparent outline-none text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
					/>
					<button
						type="button"
						onClick={handleAdd}
						disabled={!draft.trim() || adding}
						className="shrink-0 flex items-center justify-center h-6 w-6 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-30 transition cursor-pointer disabled:cursor-not-allowed"
					>
						{adding ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<Plus className="w-3 h-3" />
						)}
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-1">
				{showLoader && <CenteredLoader />}
				{!showLoader && memories.length === 0 && (
					<EmptyState
						icon={<Brain className="w-8 h-8" />}
						title="暂无记忆"
						subtitle="对话时自动提取，或在上方手动添加"
					/>
				)}
				{memories.map((m) => (
					<MemoryListItem
						key={m.id}
						item={m}
						onDelete={() => handleDelete(m.id)}
					/>
				))}
			</div>
		</div>
	);
};

const MemoryListItem: FC<{
	item: MemoryItem;
	onDelete: () => void;
}> = ({ item, onDelete }) => {
	const [editing, setEditing] = useState(false);

	if (editing) {
		return (
			<InlineEdit
				icon={<Brain className="w-4 h-4" />}
				value={item.memory}
				onSave={async (newText) => {
					// Mem0 doesn't have a direct update-text API;
					// delete old + add new
					await fetch(`/api/memories/${item.id}`, { method: "DELETE" });
					await fetch("/api/memories", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ text: newText }),
					});
				}}
				onCancel={() => setEditing(false)}
			/>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: list item
		<div
			className={`${ITEM_BASE} items-start`}
			onDoubleClick={() => setEditing(true)}
		>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed">
					{item.memory}
				</p>
				<div className="flex items-center gap-1.5 mt-1 flex-wrap">
					{item.categories?.map((cat) => (
						<span
							key={cat}
							className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
						>
							{cat}
						</span>
					))}
					<span className="text-[10px] text-zinc-400 dark:text-zinc-600">
						{timeAgo(Math.floor(new Date(item.updated_at).getTime() / 1000))}
					</span>
				</div>
			</div>
			<ItemActions onEdit={() => setEditing(true)} onRemove={onDelete} />
		</div>
	);
};

// ── Documents Panel ────────────────────────────────────────────────────────────

interface LibraryDoc {
	id: string;
	title: string;
	chunks: number;
	status: string;
	lang?: string | null;
	fileExt?: string | null;
	createdAt: number;
}

const PLACEHOLDER_TITLE = "等待解析后自动生成标题…";

const DocumentsPanel: FC<{
	activeDocId: string | null;
	onDocSelect?: (
		docId: string,
		title: string,
		lang?: string | null,
		fileExt?: string | null,
	) => void;
}> = ({ activeDocId, onDocSelect }) => {
	const [docs, setDocs] = useState<LibraryDoc[]>(
		() => readCache<LibraryDoc[]>(CACHE_KEYS.library) ?? [],
	);
	const [loading, setLoading] = useState(true);
	const [dragOver, setDragOver] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

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

	const fetchDocs = useCallback(async () => {
		try {
			const res = await fetch("/api/documents");
			if (res.ok) {
				const data = await res.json();
				setDocs(data as LibraryDoc[]);
				writeCache(CACHE_KEYS.library, data);
			}
		} catch {
			/* ignore */
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchDocs();
	}, [fetchDocs]);

	const updateDocStatus = useCallback(
		(docId: string, status: string, extra?: Partial<LibraryDoc>) => {
			setDocs((prev) =>
				prev.map((p) => (p.id === docId ? { ...p, status, ...extra } : p)),
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
		const digest = await crypto.subtle.digest("SHA-256", buffer);
		const hash = [...new Uint8Array(digest)]
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		try {
			const checkRes = await fetch(
				`/api/documents/check?hash=${encodeURIComponent(hash)}`,
			);
			if (checkRes.ok) {
				const check = (await checkRes.json()) as { exists: boolean };
				if (check.exists) {
					await fetchDocs();
					return;
				}
			}
		} catch {
			/* proceed */
		}

		const tempId = crypto.randomUUID() as string;
		setDocs((prev) => [
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

		const form = new FormData();
		form.append("file", file);

		try {
			const res = await fetch("/api/documents", { method: "POST", body: form });
			if (!res.ok || !res.body) {
				updateDocStatus(tempId, "failed");
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buf = "";
			let realDocId = tempId;

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
							docId?: string;
							chunks?: number;
							lang?: string;
							fileName?: string;
							duplicate?: boolean;
						};
						if (data.docId && realDocId === tempId) {
							realDocId = data.docId;
							setDocs((prev) =>
								prev.map((p) =>
									p.id === tempId ? { ...p, id: realDocId } : p,
								),
							);
						}
						if (data.duplicate) {
							setDocs((prev) => prev.filter((p) => p.id !== realDocId));
							await fetchDocs();
							return;
						}
						updateDocStatus(realDocId, data.status, {
							chunks: data.chunks ?? 0,
							lang: data.lang,
						});
						if (data.status === "ready") {
							try {
								const titleRes = await fetch(
									`/api/documents/${realDocId}/generate-title`,
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
									if (title) updateDocStatus(realDocId, "ready", { title });
								}
							} catch {
								/* best-effort */
							}
						}
					} catch {
						/* skip */
					}
				}
			}
		} catch {
			updateDocStatus(tempId, "failed");
		}
	};

	const handleUnlink = async (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setDocs((prev) => {
			const next = prev.filter((p) => p.id !== id);
			writeCache(CACHE_KEYS.library, next);
			return next;
		});
		await fetch(`/api/documents/${id}`, { method: "DELETE" });
	};

	const handleRename = async (id: string, title: string) => {
		setDocs((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
		await fetch(`/api/documents/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title }),
		});
	};

	const showLoader = loading && docs.length === 0;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drop zone
		<div
			ref={panelRef}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: paste target
			tabIndex={0}
			className={`flex-1 flex flex-col overflow-hidden transition-colors outline-none ${dragOver ? "bg-blue-50 dark:bg-blue-900/10" : ""}`}
			onDrop={(e) => {
				e.preventDefault();
				setDragOver(false);
				const f = e.dataTransfer.files[0];
				if (f) handleUpload(f);
			}}
			onDragOver={(e) => {
				e.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node))
					setDragOver(false);
			}}
		>
			<button
				type="button"
				className={`m-3 p-4 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-2 cursor-pointer ${dragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20" : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600"}`}
				onClick={() => fileRef.current?.click()}
			>
				<Upload className="w-5 h-5 text-zinc-400" />
				<span className="text-xs text-zinc-500 dark:text-zinc-400">
					拖拽、点击或粘贴上传
				</span>
				<span className="text-[10px] text-zinc-400 dark:text-zinc-600">
					PDF · 图片 · TXT · MD · DOCX
				</span>
			</button>

			<input
				ref={fileRef}
				type="file"
				accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.docx"
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) handleUpload(f);
					e.target.value = "";
				}}
			/>

			<div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-1 pointer-events-auto">
				{showLoader && <CenteredLoader />}
				{!showLoader && docs.length === 0 && (
					<EmptyState
						icon={<BookOpen className="w-8 h-8" />}
						title="暂无文档"
						subtitle="拖拽、点击或粘贴上传文件到上方区域"
					/>
				)}
				{docs.map((p) => (
					<DocListItem
						key={p.id}
						doc={p}
						isActive={p.id === activeDocId}
						onClick={() => {
							if (p.status === "ready")
								onDocSelect?.(p.id, p.title, p.lang, p.fileExt);
						}}
						onUnlink={(e) => handleUnlink(p.id, e)}
						onRename={(title) => handleRename(p.id, title)}
					/>
				))}
			</div>
		</div>
	);
};

// ── Progress Bar ────────────────────────────────────────────────────────────

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
				className={`text-[10px] whitespace-nowrap ${done ? "text-emerald-500 dark:text-emerald-400" : current ? "text-blue-500 dark:text-blue-400 font-semibold" : "text-zinc-300 dark:text-zinc-700"}`}
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

// ── Document List Item ─────────────────────────────────────────────────────────

const DocListItem: FC<{
	doc: LibraryDoc;
	isActive: boolean;
	onClick: () => void;
	onUnlink: (e: React.MouseEvent) => void;
	onRename: (title: string) => void;
}> = ({ doc: p, isActive, onClick, onUnlink, onRename }) => {
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
		// biome-ignore lint/a11y/useKeyWithClickEvents: document click
		// biome-ignore lint/a11y/noStaticElementInteractions: document click
		<div
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			onDoubleClick={() => isReady && setEditing(true)}
			className={`${ITEM_BASE} ${!isReady ? (p.status === "failed" ? "opacity-50 text-zinc-500" : "text-zinc-500 dark:text-zinc-400") : isActive ? ITEM_ACTIVE : ITEM_IDLE}`}
		>
			<div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
				<div className="shrink-0 opacity-60">{icon}</div>
				<div className="min-w-0 flex-1">
					<span className="block truncate">{p.title}</span>
					{isReady ? (
						<div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
							<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
								{p.chunks} 片段
							</span>
							<span className="text-[10px] text-zinc-400 dark:text-zinc-600">
								{timeAgo(p.createdAt)}
							</span>
						</div>
					) : p.status === "failed" ? (
						<div className="text-[10px] text-red-400 font-normal">解析失败</div>
					) : (
						<ProgressBar status={p.status} />
					)}
				</div>
			</div>
			<ItemActions
				onEdit={isReady ? () => setEditing(true) : undefined}
				onRemove={onUnlink}
			/>
		</div>
	);
};

import { BookOpen, Loader2, Upload } from "lucide-react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { getFileIcon } from "../../lib/file-icons";
import {
	CACHE_KEYS,
	CenteredLoader,
	EmptyState,
	InlineEdit,
	ITEM_ACTIVE,
	ITEM_BASE,
	ITEM_IDLE,
	ItemActions,
	readCache,
	timeAgo,
	writeCache,
} from "./shared";

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

export const DocumentsPanel: FC<{
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

// ── Document List Item ──────────────────────────────────────────────────────

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

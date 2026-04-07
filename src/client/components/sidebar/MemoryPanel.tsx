import { Brain, Loader2, Plus } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";
import {
	CACHE_KEYS,
	CenteredLoader,
	EmptyState,
	InlineEdit,
	ITEM_BASE,
	ItemActions,
	MEMORY_POLL_INTERVAL,
	readCache,
	timeAgo,
	writeCache,
} from "./shared";

interface MemoryItem {
	id: string;
	memory: string;
	categories?: string[] | null;
	created_at: string;
	updated_at: string;
}

export const MemoryPanel: FC = () => {
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

	const showLoader = loading && memories.length === 0;

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
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

const MemoryListItem: FC<{ item: MemoryItem; onDelete: () => void }> = ({
	item,
	onDelete,
}) => {
	const [editing, setEditing] = useState(false);

	if (editing) {
		return (
			<InlineEdit
				icon={<Brain className="w-4 h-4" />}
				value={item.memory}
				onSave={async (newText) => {
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

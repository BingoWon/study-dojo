/** Shared components, styles, and utilities for sidebar panels. */

import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { type FC, type ReactNode, useEffect, useRef, useState } from "react";

// ── Shared Constants ────────────────────────────────────────────────────────

export const CACHE_KEYS = {
	library: "cache:documents",
	memory: "cache:memories",
} as const;

export const MEMORY_POLL_INTERVAL = 30_000;

export const ITEM_BASE =
	"group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition cursor-pointer w-full text-left";
export const ITEM_ACTIVE =
	"bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900";
export const ITEM_IDLE =
	"text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900";

// ── Helpers ─────────────────────────────────────────────────────────────────

export function timeAgo(unixSeconds: number): string {
	const diff = Math.floor(Date.now() / 1000) - unixSeconds;
	if (diff < 60) return "刚刚";
	if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
	if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
	if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
	if (diff < 2592000) return `${Math.floor(diff / 604800)} 周前`;
	const d = new Date(unixSeconds * 1000);
	return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function readCache<T>(key: string): T | null {
	try {
		const raw = sessionStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export function writeCache(key: string, data: unknown) {
	try {
		sessionStorage.setItem(key, JSON.stringify(data));
	} catch {}
}

// ── Shared Components ───────────────────────────────────────────────────────

export const EmptyState: FC<{
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

export const CenteredLoader: FC = () => (
	<div className="flex flex-1 items-center justify-center py-8">
		<Loader2 className="h-5 w-5 animate-spin text-zinc-300 dark:text-zinc-600" />
	</div>
);

export const InlineEdit: FC<{
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

export const ItemActions: FC<{
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

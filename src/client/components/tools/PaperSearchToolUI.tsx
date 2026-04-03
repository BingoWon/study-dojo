import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { BookOpen, Loader2, Search, Sparkles } from "lucide-react";
import { type FC, useState } from "react";

// ── Suggest Search (interactive card) ───────────────────────────────────────

export const SuggestSearchToolUI: FC<ToolCallMessagePartProps> = ({
	args,
	result,
}) => {
	const a = args as {
		queries?: string[];
		defaultTopK?: number;
	};

	if (!result) {
		return (
			<div className="mb-3 flex items-center gap-2 text-xs text-blue-500 dark:text-blue-400">
				<Loader2 className="w-3.5 h-3.5 animate-spin" />
				正在生成检索建议...
			</div>
		);
	}

	const r = result as {
		queries: string[];
		defaultTopK: number;
		papers: number;
		needsConfirmation: boolean;
	};

	return (
		<SearchCard
			queries={r.queries ?? a.queries ?? []}
			defaultTopK={r.defaultTopK ?? a.defaultTopK ?? 5}
			papers={r.papers ?? 0}
		/>
	);
};

// ── Search Card (Human-in-the-Loop) ─────────────────────────────────────────

const SearchCard: FC<{
	queries: string[];
	defaultTopK: number;
	papers: number;
}> = ({ queries, defaultTopK, papers }) => {
	const [selected, setSelected] = useState<number | null>(null);
	const [custom, setCustom] = useState("");
	const [topK, setTopK] = useState(defaultTopK);
	const [submitted, setSubmitted] = useState<string | null>(null);

	if (submitted) {
		return (
			<div className="mb-3 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
				<Search className="w-3.5 h-3.5" />
				已提交检索：{submitted}
			</div>
		);
	}

	const activeQuery =
		selected !== null
			? selected < queries.length
				? queries[selected]
				: custom.trim()
			: null;

	const canSubmit = activeQuery && activeQuery.length > 0;

	const handleAutoSelect = () => {
		setSelected(0);
	};

	const handleSubmit = () => {
		if (!canSubmit) return;
		setSubmitted(activeQuery);
		// Dispatch a custom event that Chat can listen to
		window.dispatchEvent(
			new CustomEvent("paper-search-confirm", {
				detail: { query: activeQuery, topK },
			}),
		);
	};

	return (
		<div className="mb-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
				<div className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
					<BookOpen className="w-4 h-4 text-blue-500" />
					论文检索
				</div>
				<span className="text-[10px] text-zinc-400 dark:text-zinc-500">
					{papers} 篇论文
				</span>
			</div>

			{/* Query Options */}
			<div className="p-4 space-y-2">
				<div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
					选择检索查询
				</div>
				{queries.map((q, i) => (
					<button
						key={q}
						type="button"
						onClick={() => setSelected(i)}
						className={`w-full text-left px-3 py-2 rounded-lg text-sm transition cursor-pointer border ${
							selected === i
								? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
								: "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600"
						}`}
					>
						{q}
					</button>
				))}

				{/* Custom input */}
				<div
					className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition ${
						selected === queries.length
							? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700"
							: "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700"
					}`}
				>
					<input
						type="text"
						value={custom}
						onChange={(e) => {
							setCustom(e.target.value);
							setSelected(queries.length);
						}}
						onFocus={() => setSelected(queries.length)}
						placeholder="自定义查询..."
						className="flex-1 bg-transparent text-sm outline-none text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-600"
					/>
				</div>
			</div>

			{/* TopK Slider */}
			<div className="px-4 pb-3">
				<div className="flex items-center justify-between mb-1">
					<span className="text-[10px] text-zinc-400 dark:text-zinc-500">
						检索数量
					</span>
					<span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
						{topK} 条
					</span>
				</div>
				<input
					type="range"
					min={1}
					max={20}
					value={topK}
					onChange={(e) => setTopK(Number(e.target.value))}
					className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
				/>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
				<button
					type="button"
					onClick={handleAutoSelect}
					className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
				>
					<Sparkles className="w-3 h-3" />
					帮我选择
				</button>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!canSubmit}
					className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
						canSubmit
							? "bg-blue-500 hover:bg-blue-600 text-white cursor-pointer"
							: "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
					}`}
				>
					<Search className="w-3 h-3" />
					确认搜索
				</button>
			</div>
		</div>
	);
};

// ── Search Execution Result ─────────────────────────────────────────────────

export const PaperSearchToolUI: FC<ToolCallMessagePartProps> = ({
	result,
	isError,
}) => {
	if (isError) {
		return <div className="mb-2 text-xs text-red-500">论文检索失败</div>;
	}

	if (!result) {
		return (
			<div className="mb-2 flex items-center gap-2 text-xs text-blue-500 dark:text-blue-400">
				<Loader2 className="w-3.5 h-3.5 animate-spin" />
				正在检索论文...
			</div>
		);
	}

	const r = result as { context?: string; papers?: number; message?: string };
	const hasContext = r.context && r.context !== "未找到相关内容";

	return (
		<div className="mb-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
			<BookOpen className="w-3.5 h-3.5 shrink-0" />
			{hasContext
				? `已从 ${r.papers ?? 0} 篇论文中检索到相关内容`
				: r.message || "未找到相关内容"}
		</div>
	);
};

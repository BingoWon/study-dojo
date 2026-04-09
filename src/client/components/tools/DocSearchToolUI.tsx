import { makeAssistantToolUI, useToolArgsStatus } from "@assistant-ui/react";
import { BookOpen, Loader2, Search, Sparkles, X } from "lucide-react";
import { type FC, useState } from "react";

// ── Doc Suggest (HITL — streams query options, blocks for user choice) ──────

type SuggestArgs = { queries?: string[]; defaultTopK?: number };
type SuggestResult = { action: string; query?: string; topK?: number };

export const DocSuggestToolUI = makeAssistantToolUI<SuggestArgs, SuggestResult>(
	{
		toolName: "doc_suggest",
		render: ({ args, result, addResult }) => {
			const { propStatus } = useToolArgsStatus<SuggestArgs>();

			// Already resolved — compact confirmation
			if (result) {
				const icon =
					result.action === "skip" ? (
						<X className="w-3.5 h-3.5" />
					) : result.action === "auto" ? (
						<Sparkles className="w-3.5 h-3.5" />
					) : (
						<Search className="w-3.5 h-3.5" />
					);
				const text =
					result.action === "skip"
						? "已跳过确认，由 AI 自主检索"
						: result.action === "auto"
							? "已委托 AI 选择最佳查询"
							: `已确认检索：${result.query}（${result.topK} 条）`;
				const colors =
					result.action === "skip"
						? "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200/60 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400"
						: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400";
				return (
					<div
						className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs border ${colors}`}
					>
						{icon}
						<span className="font-medium">{text}</span>
					</div>
				);
			}

			const queries = args?.queries ?? [];
			const queriesStreaming = propStatus.queries === "streaming";

			if (queries.length > 0) {
				return (
					<SearchCard
						queries={queries}
						queriesStreaming={queriesStreaming}
						defaultTopK={args?.defaultTopK ?? 5}
						addResult={addResult}
					/>
				);
			}

			// Still waiting for first query
			return (
				<div className="mb-3 flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/30 px-3 py-2.5 text-xs text-blue-600 dark:text-blue-400">
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
					<span className="font-medium">正在生成检索建议...</span>
				</div>
			);
		},
	},
);

// ── Search Card ─────────────────────────────────────────────────────────────

const SearchCard: FC<{
	queries: string[];
	queriesStreaming: boolean;
	defaultTopK: number;
	addResult: (result: SuggestResult) => void;
}> = ({ queries, queriesStreaming, defaultTopK, addResult }) => {
	const [selected, setSelected] = useState<number | null>(null);
	const [custom, setCustom] = useState("");
	const [topK, setTopK] = useState(defaultTopK);

	const activeQuery =
		selected !== null
			? selected < queries.length
				? queries[selected]
				: custom.trim()
			: null;
	const canSubmit = !!activeQuery && !queriesStreaming;

	return (
		<div className="mb-3 rounded-2xl border border-blue-200/60 dark:border-blue-800/30 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-divider dark:border-divider-dark">
				<div className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
					<div className="p-1 rounded-lg bg-blue-100 dark:bg-blue-900/30">
						<BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
					</div>
					文档检索
				</div>
				<span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
					{queriesStreaming ? "生成中..." : "等待确认"}
				</span>
			</div>

			{/* Query options */}
			<div className="p-3 space-y-1.5">
				<div className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1 mb-1">
					选择检索查询
				</div>
				{queries.map((q, i) => (
					<button
						key={q}
						type="button"
						onClick={() => setSelected(i)}
						className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm transition-all cursor-pointer border ${
							selected === i
								? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
								: "bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200/60 dark:border-zinc-700/40 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600"
						}`}
					>
						{q}
						{queriesStreaming && i === queries.length - 1 && (
							<span className="ml-1 inline-block w-1.5 h-3.5 bg-blue-400 dark:bg-blue-500 animate-pulse rounded-sm" />
						)}
					</button>
				))}
				{!queriesStreaming && (
					<div
						className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border transition-colors ${
							selected === queries.length
								? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700"
								: "bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200/60 dark:border-zinc-700/40"
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
				)}
			</div>

			{/* TopK slider + action buttons */}
			{!queriesStreaming && (
				<>
					<div className="px-4 pb-3">
						<div className="flex items-center justify-between mb-1.5">
							<span className="text-[11px] text-zinc-400 dark:text-zinc-500">
								检索数量
							</span>
							<span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 tabular-nums">
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

					<div className="flex items-center gap-2 px-4 py-3 border-t border-divider dark:border-divider-dark">
						<button
							type="button"
							onClick={() =>
								addResult({
									action: "auto",
									message:
										"用户让你帮他选择，请自行决定最佳查询和参数来执行 doc_rag_search。",
								} as SuggestResult)
							}
							className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition cursor-pointer"
						>
							<Sparkles className="w-3 h-3" />
							帮我选
						</button>
						<button
							type="button"
							disabled={!canSubmit}
							onClick={() =>
								addResult({
									action: "confirm",
									query: activeQuery as string,
									topK,
									message: `用户确认使用查询「${activeQuery}」检索 ${topK} 条结果。请调用 doc_rag_search。`,
								} as SuggestResult)
							}
							className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
								canSubmit
									? "bg-blue-500 hover:bg-blue-600 text-white cursor-pointer shadow-sm"
									: "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
							}`}
						>
							<Search className="w-3 h-3" />
							确认检索
						</button>
						<button
							type="button"
							onClick={() =>
								addResult({
									action: "skip",
									message: "用户不想被确认，请直接执行 doc_rag_search。",
								} as SuggestResult)
							}
							className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition cursor-pointer"
						>
							<X className="w-3 h-3" />
							跳过
						</button>
					</div>
				</>
			)}
		</div>
	);
};

// ── Doc Search Result ───────────────────────────────────────────────────────

type SearchArgs = { query: string; topK: number };
type SearchResult = {
	context?: string;
	searchedDocuments?: number;
	totalDocuments?: number;
	message?: string;
};

export const DocSearchToolUI = makeAssistantToolUI<SearchArgs, SearchResult>({
	toolName: "doc_rag_search",
	render: ({ result, status }) => {
		if (status.type === "running") {
			return (
				<div className="mb-3 flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/30 px-3 py-2.5 text-xs text-blue-600 dark:text-blue-400">
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
					<span className="font-medium">正在检索文档...</span>
				</div>
			);
		}
		if (!result) return null;
		const hasContext = !!result.context && result.context !== "未找到相关内容";
		const scope =
			result.searchedDocuments &&
			result.totalDocuments &&
			result.searchedDocuments < result.totalDocuments
				? `${result.searchedDocuments} 份指定文档`
				: `${result.totalDocuments ?? 0} 份文档`;
		const colors = hasContext
			? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400"
			: "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200/60 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400";
		return (
			<div
				className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs border ${colors}`}
			>
				<BookOpen className="w-3.5 h-3.5 shrink-0" />
				<span className="font-medium">
					{hasContext
						? `已从 ${scope} 中检索到相关内容`
						: result.message || "未找到相关内容"}
				</span>
			</div>
		);
	},
});

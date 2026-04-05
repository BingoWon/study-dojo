import { makeAssistantToolUI } from "@assistant-ui/react";
import { GraduationCap, Search } from "lucide-react";
import { type ExaResult, ExaResultList } from "./ExaResultList";

type Args = { query: string };
type Result = { results: ExaResult[] };

export const AcademicSearchToolUI = makeAssistantToolUI<Args, Result>({
	toolName: "search_papers",
	render: ({ args, result, status }) => {
		const isRunning = status.type === "running";
		const results = result?.results ?? [];

		return (
			<div className="mb-4 w-full rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/50 p-4 shadow-sm dark:shadow-none">
				<div className="flex items-center gap-2 mb-3 pb-3 border-b border-divider dark:border-divider-dark">
					<div
						className={`p-1.5 rounded-lg ${isRunning ? "bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 animate-pulse" : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"}`}
					>
						{isRunning ? (
							<Search className="w-4 h-4" />
						) : (
							<GraduationCap className="w-4 h-4" />
						)}
					</div>
					<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
						{isRunning
							? "正在搜索学术论文..."
							: `找到 ${results.length} 篇论文`}
					</span>
				</div>

				<div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 italic mb-4">
					搜索词: &quot;{args?.query || "..."}&quot;
				</div>

				{!isRunning && results.length > 0 && (
					<ExaResultList results={results} maxItems={10} textSlice={300} />
				)}
			</div>
		);
	},
});

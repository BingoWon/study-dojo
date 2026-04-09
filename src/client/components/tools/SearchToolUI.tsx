import { makeAssistantToolUI } from "@assistant-ui/react";
import { Globe, Loader2 } from "lucide-react";
import { type ExaResult, ExaResultList } from "./ExaResultList";

type Args = { query: string };
type Result = { results: ExaResult[] };

export const SearchToolUI = makeAssistantToolUI<Args, Result>({
	toolName: "search_web",
	render: ({ args, result, status }) => {
		const isRunning = status.type === "running";
		const results = result?.results ?? [];

		return (
			<div className="mb-3 rounded-2xl border border-zinc-200/60 dark:border-zinc-700/40 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm">
				<div className="flex items-center gap-2 px-4 py-3 border-b border-divider dark:border-divider-dark">
					<div className="p-1 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
						{isRunning ? (
							<Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin" />
						) : (
							<Globe className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
						)}
					</div>
					<span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
						{isRunning ? "搜索中..." : `${results.length} 条结果`}
					</span>
					<span className="text-xs text-zinc-400 dark:text-zinc-500 italic truncate ml-auto">
						{args?.query}
					</span>
				</div>
				{!isRunning && results.length > 0 && (
					<div className="p-2">
						<ExaResultList results={results} />
					</div>
				)}
			</div>
		);
	},
});

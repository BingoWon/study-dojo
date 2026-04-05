import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { Loader2 } from "lucide-react";
import type { FC } from "react";

export const ToolCallFallback: FC<ToolCallMessagePartProps> = ({
	toolName,
	result,
	isError,
}) => {
	const status =
		result !== undefined ? (isError ? "error" : "done") : "running";
	const statusColor =
		status === "running"
			? "text-blue-500/80 bg-blue-500/10 border-blue-500/20"
			: status === "error"
				? "text-red-500/80 bg-red-500/10 border-red-500/20"
				: "text-emerald-500/80 bg-emerald-500/10 border-emerald-500/20";
	const statusText =
		status === "running" ? "运行中" : status === "error" ? "错误" : "已完成";

	return (
		<div className="mb-2 w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-900/50 overflow-hidden shadow-sm">
			<div className="flex w-full items-center justify-between px-3 py-2.5">
				<div className="flex items-center gap-2.5">
					<div
						className={`flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-bold ${statusColor}`}
					>
						{status === "running" ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							statusText[0]
						)}
					</div>
					<div className="flex flex-col items-start gap-0.5">
						<span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
							{toolName}
						</span>
						<span className="text-[9px] font-semibold tracking-wider uppercase opacity-70">
							{statusText}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
};

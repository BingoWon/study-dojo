import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { ChevronRight, Code2 } from "lucide-react";
import { type FC, useState } from "react";
import { getToolStatus } from "../../lib/tool-status";

export const ToolCallFallback: FC<ToolCallMessagePartProps> = ({
	toolName,
	args,
	result,
	isError,
}) => {
	const [open, setOpen] = useState(false);
	const status = getToolStatus(result !== undefined, isError === true);

	const statusColor =
		status === "running"
			? "text-blue-500/80 dark:text-blue-400/80 bg-blue-500/10 border-blue-500/20"
			: status === "error"
				? "text-red-500/80 dark:text-red-400/80 bg-red-500/10 border-red-500/20"
				: "text-emerald-500/80 dark:text-emerald-400/80 bg-emerald-500/10 border-emerald-500/20";

	const statusText =
		status === "running" ? "运行中" : status === "error" ? "错误" : "已完成";

	return (
		<div className="mb-2 w-full max-w-sm rounded-xl border border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-900/50 overflow-hidden shadow-sm transition-all duration-300">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
			>
				<div className="flex items-center gap-2.5">
					<div
						className={`flex h-6 w-6 items-center justify-center rounded-md border ${statusColor}`}
					>
						<Code2 className="w-3.5 h-3.5" />
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
				<ChevronRight
					className={`w-4 h-4 text-zinc-400 dark:text-zinc-500 transition-transform duration-300 ${open ? "rotate-90" : ""}`}
				/>
			</button>

			{open && (
				<div className="flex flex-col gap-2 px-3 pb-3 pt-1 border-t border-zinc-200 dark:border-white/5 bg-white/50 dark:bg-black/10">
					{args !== undefined && (
						<div className="flex flex-col gap-1">
							<span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-500">
								参数
							</span>
							<pre className="text-[10px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-black/30 p-2 rounded-lg overflow-x-auto border border-zinc-200/50 dark:border-white/5">
								{JSON.stringify(args, null, 2)}
							</pre>
						</div>
					)}
					{result !== undefined && (
						<div className="flex flex-col gap-1 mt-1">
							<span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-500">
								{isError ? "错误" : "结果"}
							</span>
							<pre className="text-[10px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-black/30 p-2 rounded-lg overflow-x-auto border border-zinc-200/50 dark:border-white/5 max-h-32">
								{JSON.stringify(result, null, 2)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

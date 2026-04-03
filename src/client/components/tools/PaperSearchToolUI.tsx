import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { BookOpen, Loader2 } from "lucide-react";
import type { FC } from "react";

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
		<div className="mb-2 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
			<BookOpen className="w-3.5 h-3.5 shrink-0" />
			{hasContext
				? `已从 ${r.papers ?? 0} 篇论文中检索到相关内容`
				: r.message || "未找到相关内容"}
		</div>
	);
};

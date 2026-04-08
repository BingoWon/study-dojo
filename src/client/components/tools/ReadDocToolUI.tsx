import { makeAssistantToolUI } from "@assistant-ui/react";
import { BookOpen, FileText, Loader2 } from "lucide-react";

type Args = { docId: string; startChunk?: number; count?: number };
type Result = {
	title?: string;
	content?: string;
	startChunk?: number;
	endChunk?: number;
	totalChunks?: number;
	hasMore?: boolean;
	error?: string;
};

export const ReadDocToolUI = makeAssistantToolUI<Args, Result>({
	toolName: "read_document",
	render: ({ result, status }) => {
		if (status.type === "running") {
			return (
				<div className="mb-2 flex items-center gap-2 text-xs text-blue-500 dark:text-blue-400">
					<Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在阅读文档...
				</div>
			);
		}
		if (!result) return null;
		if (result.error) {
			return (
				<div className="mb-2 flex items-center gap-2 text-xs text-red-500">
					<FileText className="w-3.5 h-3.5" /> {result.error}
				</div>
			);
		}
		return (
			<div className="mb-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
				<BookOpen className="w-3.5 h-3.5" />
				已读取「{result.title}」第 {result.startChunk}-{result.endChunk} 块（共{" "}
				{result.totalChunks} 块）
			</div>
		);
	},
});

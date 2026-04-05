import { makeAssistantToolUI } from "@assistant-ui/react";
import { BookOpen, Check, Loader2, X } from "lucide-react";
import { useContext, useEffect, useRef } from "react";
import { DocSelectCtx } from "../../Chat";

type Args = { docId: string };
type Result = {
	success: boolean;
	docId?: string;
	title?: string;
	lang?: string | null;
	fileExt?: string | null;
	message?: string;
};

export const OpenDocToolUI = makeAssistantToolUI<Args, Result>({
	toolName: "open_document",
	render: ({ result, status }) => {
		const onDocSelect = useContext(DocSelectCtx);
		const appliedRef = useRef(false);

		useEffect(() => {
			if (
				result?.success &&
				result.docId &&
				result.title &&
				status.type === "complete" &&
				!appliedRef.current
			) {
				appliedRef.current = true;
				onDocSelect?.(result.docId, result.title, result.lang, result.fileExt);
			}
		}, [result, status, onDocSelect]);

		if (status.type === "running") {
			return (
				<div className="mb-2 flex items-center gap-2 text-xs text-blue-500 dark:text-blue-400">
					<Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在打开文档...
				</div>
			);
		}
		if (!result?.success) {
			return (
				<div className="mb-2 flex items-center gap-2 text-xs text-red-500">
					<X className="w-3.5 h-3.5" /> {result?.message || "打开文档失败"}
				</div>
			);
		}
		return (
			<div className="mb-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
				<BookOpen className="w-3.5 h-3.5" /> 已打开「{result.title}」
			</div>
		);
	},
});

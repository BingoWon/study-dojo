import { makeAssistantToolUI } from "@assistant-ui/react";
import { Highlighter, Loader2, X } from "lucide-react";
import { useContext, useEffect, useRef } from "react";
import { HighlightCtx } from "../../Chat";

type Args = { docId: string; text?: string; color?: string };
type Result = {
	success: boolean;
	docId?: string;
	title?: string;
	lang?: string | null;
	fileExt?: string | null;
	text?: string | null;
	color?: string;
	message?: string;
};

const COLOR_LABELS: Record<string, string> = {
	yellow: "黄色",
	red: "红色",
	green: "绿色",
	blue: "蓝色",
	purple: "紫色",
	transparent: "清除",
};

export const HighlightDocToolUI = makeAssistantToolUI<Args, Result>({
	toolName: "highlight_document",
	render: ({ result, status }) => {
		const onHighlight = useContext(HighlightCtx);
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
				onHighlight?.({
					docId: result.docId,
					text: result.text ?? null,
					color: result.color ?? "yellow",
					title: result.title,
					lang: result.lang,
					fileExt: result.fileExt,
				});
			}
		}, [result, status, onHighlight]);

		if (status.type === "running") {
			return (
				<div className="mb-2 flex items-center gap-2 text-xs text-blue-500 dark:text-blue-400">
					<Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在标注文档...
				</div>
			);
		}
		if (!result?.success) {
			return (
				<div className="mb-2 flex items-center gap-2 text-xs text-red-500">
					<X className="w-3.5 h-3.5" /> {result?.message || "标注失败"}
				</div>
			);
		}
		const colorLabel = COLOR_LABELS[result.color ?? "yellow"] ?? result.color;
		const isClearing = result.color === "transparent";
		return (
			<div className="mb-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
				<Highlighter className="w-3.5 h-3.5" />
				{isClearing
					? `已清除「${result.title}」的高亮`
					: `已用${colorLabel}高亮「${result.title}」${result.text ? "中的选定文本" : "全文"}`}
			</div>
		);
	},
});

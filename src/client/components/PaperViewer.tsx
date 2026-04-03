import { Globe, Languages, Loader2 } from "lucide-react";
import { type FC, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const PaperViewer: FC<{
	paperId: string;
	lang?: string | null;
}> = ({ paperId, lang }) => {
	const isEnglish = lang === "en";
	const [viewLang, setViewLang] = useState<"original" | "zh">(
		isEnglish ? "zh" : "original",
	);
	const [markdown, setMarkdown] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);

		const url =
			viewLang === "zh" && isEnglish
				? `/api/papers/${paperId}/markdown?lang=zh`
				: `/api/papers/${paperId}/markdown`;

		fetch(url)
			.then((res) => {
				if (!res.ok) throw new Error("加载失败");
				return res.text();
			})
			.then((text) => {
				if (!cancelled) {
					setMarkdown(text);
					setLoading(false);
				}
			})
			.catch((e) => {
				if (!cancelled) {
					setError(e.message);
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [paperId, viewLang, isEnglish]);

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			{/* Language toggle bar (only for English papers) */}
			{isEnglish && (
				<div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-sm shrink-0">
					<button
						type="button"
						onClick={() => setViewLang("zh")}
						className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
							viewLang === "zh"
								? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
								: "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
						}`}
					>
						<Languages className="w-3 h-3" />
						中文翻译
					</button>
					<button
						type="button"
						onClick={() => setViewLang("original")}
						className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
							viewLang === "original"
								? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
								: "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
						}`}
					>
						<Globe className="w-3 h-3" />
						英文原版
					</button>
				</div>
			)}

			{/* Content area */}
			{loading ? (
				<div className="flex-1 flex items-center justify-center">
					<Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
				</div>
			) : error ? (
				<div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
					{error}
				</div>
			) : (
				<div className="flex-1 overflow-y-auto px-8 py-6">
					<div className="max-w-3xl mx-auto">
						<div className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-200 dark:prose-pre:border-zinc-800">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>
								{markdown ?? ""}
							</ReactMarkdown>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

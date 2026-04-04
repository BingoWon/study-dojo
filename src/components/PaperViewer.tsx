"use client";

import { Loader2 } from "lucide-react";
import { type FC, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const PaperViewer: FC<{
	paperId: string;
	viewLang: "original" | "zh";
}> = ({ paperId, viewLang }) => {
	const [markdown, setMarkdown] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);

		const url =
			viewLang === "zh"
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
	}, [paperId, viewLang]);

	if (loading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
				{error}
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto px-8 py-6">
			<div className="max-w-3xl mx-auto">
				<div className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-200 dark:prose-pre:border-zinc-800">
					<ReactMarkdown remarkPlugins={[remarkGfm]}>
						{markdown ?? ""}
					</ReactMarkdown>
				</div>
			</div>
		</div>
	);
};

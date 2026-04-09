import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { type FC, useState } from "react";

export type ExaResult = {
	title: string;
	url: string;
	text?: string;
	publishedDate?: string;
	author?: string;
};

export const ExaResultList: FC<{
	results: ExaResult[];
	previewCount?: number;
	textSlice?: number;
}> = ({ results, previewCount = 2, textSlice = 200 }) => {
	const [expanded, setExpanded] = useState(false);
	const visible = expanded ? results : results.slice(0, previewCount);
	const hasMore = results.length > previewCount;

	return (
		<div className="flex flex-col gap-0.5">
			{visible.map((res) => {
				let hostname = "";
				try {
					hostname = new URL(res.url).hostname;
				} catch {
					hostname = res.url;
				}
				return (
					<a
						key={res.url}
						href={res.url}
						target="_blank"
						rel="noopener noreferrer"
						className="group flex items-start gap-2.5 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
					>
						<div className="flex-1 min-w-0">
							<div className="text-xs font-medium text-blue-600 dark:text-blue-400 group-hover:text-blue-500 line-clamp-1 flex items-center gap-1">
								{res.title || res.url}
								<ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
							</div>
							<div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 flex items-center gap-1">
								<span className="truncate">{hostname}</span>
								{res.publishedDate && (
									<>
										<span className="text-zinc-300 dark:text-zinc-600">·</span>
										{new Date(res.publishedDate).toLocaleDateString("zh-CN")}
									</>
								)}
								{res.author && (
									<>
										<span className="text-zinc-300 dark:text-zinc-600">·</span>
										<span className="truncate">{res.author}</span>
									</>
								)}
							</div>
							{res.text && (
								<div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
									{res.text.slice(0, textSlice)}
								</div>
							)}
						</div>
					</a>
				);
			})}
			{hasMore && (
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer rounded-lg hover:bg-zinc-50 dark:hover:bg-white/5"
				>
					{expanded ? (
						<>
							收起 <ChevronUp className="w-3 h-3" />
						</>
					) : (
						<>
							展开全部 {results.length} 条{" "}
							<ChevronDown className="w-3 h-3" />
						</>
					)}
				</button>
			)}
		</div>
	);
};

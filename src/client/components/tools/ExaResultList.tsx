import { ExternalLink } from "lucide-react";
import type { FC } from "react";

export type ExaResult = {
	title: string;
	url: string;
	text?: string;
	publishedDate?: string;
	author?: string;
};

export const ExaResultList: FC<{
	results: ExaResult[];
	maxItems?: number;
	textSlice?: number;
}> = ({ results, maxItems = 10, textSlice = 250 }) => (
	<div className="flex flex-col gap-3">
		{results.slice(0, maxItems).map((res) => (
			<a
				key={res.url}
				href={res.url}
				target="_blank"
				rel="noopener noreferrer"
				className="group flex flex-col gap-1 p-3 rounded-xl bg-zinc-50/50 dark:bg-transparent hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-white/5"
			>
				<div className="text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:text-blue-500 dark:group-hover:text-blue-300 flex items-center gap-1 transition-colors">
					<span className="line-clamp-2">{res.title || res.url}</span>
					<ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
				</div>
				<div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate flex items-center gap-1.5">
					<span className="truncate">{new URL(res.url).hostname}</span>
					{res.publishedDate && (
						<>
							<span>·</span>
							<span>
								{new Date(res.publishedDate).toLocaleDateString("zh-CN")}
							</span>
						</>
					)}
					{res.author && (
						<>
							<span>·</span>
							<span className="truncate">{res.author}</span>
						</>
					)}
				</div>
				{res.text && (
					<div className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed line-clamp-2">
						{res.text.slice(0, textSlice)}
					</div>
				)}
			</a>
		))}
	</div>
);

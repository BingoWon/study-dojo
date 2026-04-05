import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import type { FC } from "react";

const markdownComponents = {
	a: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a {...props} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	),
};

export const MarkdownText: FC = () => (
	<MarkdownTextPrimitive
		smooth
		components={markdownComponents}
		className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-100 prose-pre:dark:bg-zinc-950 prose-pre:border prose-pre:border-zinc-200 prose-pre:dark:border-zinc-800 break-words"
	/>
);

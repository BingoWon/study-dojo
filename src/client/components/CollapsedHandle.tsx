import { ChevronLeft, ChevronRight } from "lucide-react";
import type { FC } from "react";

export const CollapsedHandle: FC<{
	direction: "left" | "right";
	onClick: () => void;
}> = ({ direction, onClick }) => (
	<button
		type="button"
		onClick={onClick}
		className="w-[16px] h-full flex-shrink-0 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer group"
		style={{
			borderLeftWidth: direction === "right" ? 1 : 0,
			borderRightWidth: direction === "left" ? 1 : 0,
			borderStyle: "solid",
		}}
		title={direction === "left" ? "展开侧边栏" : "展开聊天面板"}
	>
		{direction === "left" ? (
			<ChevronRight className="w-3 h-3 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
		) : (
			<ChevronLeft className="w-3 h-3 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
		)}
	</button>
);

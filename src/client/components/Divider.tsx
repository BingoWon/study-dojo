import type { FC } from "react";

export const Divider: FC<{
	onMouseDown: (e: React.MouseEvent) => void;
	onDoubleClick: () => void;
	dragging: boolean;
}> = ({ onMouseDown, onDoubleClick, dragging }) => (
	// biome-ignore lint/a11y/noStaticElementInteractions: drag handle requires mouse events
	<div
		onMouseDown={onMouseDown}
		onDoubleClick={onDoubleClick}
		className={`group relative flex-shrink-0 cursor-col-resize select-none transition-all duration-150 ${
			dragging ? "w-[4px]" : "w-[12px]"
		}`}
	>
		{/* 视觉线条 */}
		<div
			className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 rounded-full transition-all duration-150 ${
				dragging
					? "w-[4px] bg-blue-500"
					: "w-[2px] bg-zinc-200 dark:bg-zinc-800 group-hover:w-[4px] group-hover:bg-blue-400"
			}`}
		/>
		{/* 中心抓手指示 */}
		<div
			className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[3px] transition-opacity duration-150 ${
				dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
			}`}
		>
			<div className="w-[3px] h-[3px] rounded-full bg-blue-400" />
			<div className="w-[3px] h-[3px] rounded-full bg-blue-400" />
			<div className="w-[3px] h-[3px] rounded-full bg-blue-400" />
		</div>
	</div>
);

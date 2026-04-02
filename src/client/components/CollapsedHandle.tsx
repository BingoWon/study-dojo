import { ChevronLeft, ChevronRight } from "lucide-react";
import { type FC, useRef } from "react";

const DRAG_EXPAND_THRESHOLD = 40;

export const CollapsedHandle: FC<{
	direction: "left" | "right";
	onClick: () => void;
}> = ({ direction, onClick }) => {
	const isLeft = direction === "left";
	const startX = useRef(0);

	const onMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		startX.current = e.clientX;

		const onMove = (ev: MouseEvent) => {
			const delta = ev.clientX - startX.current;
			const shouldExpand = isLeft
				? delta > DRAG_EXPAND_THRESHOLD
				: delta < -DRAG_EXPAND_THRESHOLD;
			if (shouldExpand) {
				cleanup();
				onClick();
			}
		};

		const cleanup = () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", cleanup);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", cleanup);
	};

	return (
		<div className="relative h-full flex-shrink-0 w-0">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: drag interaction */}
			<div
				onMouseDown={onMouseDown}
				onClick={onClick}
				className={`absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center
					w-[32px] h-[80px] transition-all duration-200 cursor-pointer
					bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800
					text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300
					shadow-md hover:shadow-lg
					${isLeft ? "left-0 rounded-r-full border-r border-y border-zinc-300 dark:border-zinc-700" : "right-0 rounded-l-full border-l border-y border-zinc-300 dark:border-zinc-700"}`}
				title={
					isLeft
						? "展开侧边栏（点击或向右拖动）"
						: "展开聊天面板（点击或向左拖动）"
				}
			>
				{isLeft ? (
					<ChevronRight className="w-4 h-4" />
				) : (
					<ChevronLeft className="w-4 h-4" />
				)}
			</div>
		</div>
	);
};

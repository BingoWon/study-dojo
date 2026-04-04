"use client";

import { type FC, useCallback, useRef, useState } from "react";

export const Divider: FC<{
	onMouseDown: (e: React.MouseEvent) => void;
	onDoubleClick: () => void;
	dragging: boolean;
}> = ({ onMouseDown, onDoubleClick, dragging }) => {
	const [hovered, setHovered] = useState(false);
	const [mouseY, setMouseY] = useState(0);
	const hitRef = useRef<HTMLDivElement>(null);

	const onMouseMove = useCallback((e: React.MouseEvent) => {
		if (!hitRef.current) return;
		const rect = hitRef.current.getBoundingClientRect();
		setMouseY(e.clientY - rect.top);
	}, []);

	const active = dragging || hovered;

	return (
		<div className="relative flex-shrink-0 w-0">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle */}
			<div
				ref={hitRef}
				onMouseDown={onMouseDown}
				onDoubleClick={onDoubleClick}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				onMouseMove={onMouseMove}
				className="absolute top-0 bottom-0 -left-[8px] w-[16px] z-20 cursor-col-resize select-none"
			>
				{/* Floating handle that follows mouse */}
				<div
					className={`absolute left-1/2 -translate-x-1/2 pointer-events-none transition-opacity duration-150 ${
						active ? "opacity-100" : "opacity-0"
					}`}
					style={{ top: Math.max(0, mouseY - 24) }}
				>
					<div className="w-[5px] h-[48px] rounded-full bg-zinc-400/80 dark:bg-zinc-500/80 shadow-sm backdrop-blur-sm" />
				</div>
			</div>
		</div>
	);
};

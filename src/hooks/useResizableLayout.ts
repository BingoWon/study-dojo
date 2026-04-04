import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

const LEFT_COLLAPSE_THRESHOLD = 120;
const RIGHT_COLLAPSE_THRESHOLD = 160;
const MIN_CENTER_WIDTH = 300;

interface DividerProps {
	onMouseDown: (e: React.MouseEvent) => void;
	onDoubleClick: () => void;
	dragging: boolean;
}

export function useResizableLayout(
	containerRef: RefObject<HTMLElement | null>,
) {
	const getContainerWidth = useCallback(
		() => containerRef.current?.offsetWidth || window.innerWidth,
		[containerRef],
	);

	const calcDefaults = useCallback(
		(w: number) => ({
			left: Math.round(w / 6),
			right: Math.round((w * 2) / 6),
		}),
		[],
	);

	const initW = typeof window !== "undefined" ? window.innerWidth : 1200;
	const initDefaults = calcDefaults(initW);

	const [leftWidth, setLeftWidth] = useState(initDefaults.left);
	const [rightWidth, setRightWidth] = useState(initDefaults.right);
	const [leftCollapsed, setLeftCollapsed] = useState(false);
	const [rightCollapsed, setRightCollapsed] = useState(false);
	const [dragging, setDragging] = useState<"left" | "right" | null>(null);

	const defaultsRef = useRef(initDefaults);
	const startRef = useRef({ x: 0, leftW: 0, rightW: 0 });
	const prevContainerWidth = useRef(initW);

	useEffect(() => {
		const w = getContainerWidth();
		const d = calcDefaults(w);
		defaultsRef.current = d;
		prevContainerWidth.current = w;
		setLeftWidth(d.left);
		setRightWidth(d.right);
	}, [getContainerWidth, calcDefaults]);

	useEffect(() => {
		const onResize = () => {
			const newW = getContainerWidth();
			const prevW = prevContainerWidth.current;
			prevContainerWidth.current = newW;
			defaultsRef.current = calcDefaults(newW);

			if (prevW > 0 && newW !== prevW) {
				const ratio = newW / prevW;
				if (!leftCollapsed) {
					setLeftWidth((prev) => Math.round(prev * ratio));
				}
				if (!rightCollapsed) {
					setRightWidth((prev) => Math.round(prev * ratio));
				}
			}
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [calcDefaults, getContainerWidth, leftCollapsed, rightCollapsed]);

	const onMouseDown = useCallback(
		(side: "left" | "right", e: React.MouseEvent) => {
			e.preventDefault();
			setDragging(side);
			startRef.current = {
				x: e.clientX,
				leftW: leftWidth,
				rightW: rightWidth,
			};

			const onMove = (ev: MouseEvent) => {
				const delta = ev.clientX - startRef.current.x;
				const containerW = getContainerWidth();

				if (side === "left") {
					const newLeft = Math.max(0, startRef.current.leftW + delta);
					const maxLeft =
						containerW - startRef.current.rightW - MIN_CENTER_WIDTH;
					const clamped = Math.min(newLeft, maxLeft);

					if (clamped < LEFT_COLLAPSE_THRESHOLD) {
						setLeftCollapsed(true);
						setLeftWidth(0);
					} else {
						setLeftCollapsed(false);
						setLeftWidth(clamped);
					}
				} else {
					const newRight = Math.max(0, startRef.current.rightW - delta);
					const maxRight =
						containerW - startRef.current.leftW - MIN_CENTER_WIDTH;
					const clamped = Math.min(newRight, maxRight);

					if (clamped < RIGHT_COLLAPSE_THRESHOLD) {
						setRightCollapsed(true);
						setRightWidth(0);
					} else {
						setRightCollapsed(false);
						setRightWidth(clamped);
					}
				}
			};

			const onUp = () => {
				setDragging(null);
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			};

			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		},
		[leftWidth, rightWidth, getContainerWidth],
	);

	const toggleLeft = useCallback(() => {
		if (leftCollapsed) {
			setLeftCollapsed(false);
			setLeftWidth(defaultsRef.current.left);
		} else {
			setLeftCollapsed(true);
			setLeftWidth(0);
		}
	}, [leftCollapsed]);

	const toggleRight = useCallback(() => {
		if (rightCollapsed) {
			setRightCollapsed(false);
			setRightWidth(defaultsRef.current.right);
		} else {
			setRightCollapsed(true);
			setRightWidth(0);
		}
	}, [rightCollapsed]);

	const leftDividerProps: DividerProps = {
		onMouseDown: (e) => onMouseDown("left", e),
		onDoubleClick: () => {
			setLeftCollapsed(false);
			setLeftWidth(defaultsRef.current.left);
		},
		dragging: dragging === "left",
	};

	const rightDividerProps: DividerProps = {
		onMouseDown: (e) => onMouseDown("right", e),
		onDoubleClick: () => {
			setRightCollapsed(false);
			setRightWidth(defaultsRef.current.right);
		},
		dragging: dragging === "right",
	};

	return {
		leftWidth,
		rightWidth,
		leftCollapsed,
		rightCollapsed,
		leftDividerProps,
		rightDividerProps,
		toggleLeft,
		toggleRight,
	};
}

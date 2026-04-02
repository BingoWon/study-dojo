import { useMessagePartReasoning } from "@assistant-ui/react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { type FC, useEffect, useRef, useState } from "react";

const AUTO_CLOSE_DELAY = 1000;

export const ReasoningPart: FC = () => {
	const reasoning = useMessagePartReasoning();
	const isStreaming = reasoning?.status?.type === "running";

	// open/close state
	const [open, setOpen] = useState(false);
	const [hasAutoClosed, setHasAutoClosed] = useState(false);
	const hasEverStreamedRef = useRef(false);

	// duration tracking
	const startTimeRef = useRef<number | null>(null);
	const [duration, setDuration] = useState<number | undefined>(undefined);

	const [copied, setCopied] = useState(false);

	// Track streaming start time + compute duration on finish
	useEffect(() => {
		if (isStreaming) {
			hasEverStreamedRef.current = true;
			if (startTimeRef.current === null) {
				startTimeRef.current = Date.now();
			}
		} else if (startTimeRef.current !== null) {
			const secs = Math.ceil((Date.now() - startTimeRef.current) / 1000);
			setDuration(secs);
			startTimeRef.current = null;
		}
	}, [isStreaming]);

	// Auto-open when streaming starts
	useEffect(() => {
		if (isStreaming && !open) setOpen(true);
	}, [isStreaming, open]);

	// Auto-close 1s after streaming ends (once only)
	useEffect(() => {
		if (hasEverStreamedRef.current && !isStreaming && open && !hasAutoClosed) {
			const timer = setTimeout(() => {
				setOpen(false);
				setHasAutoClosed(true);
			}, AUTO_CLOSE_DELAY);
			return () => clearTimeout(timer);
		}
	}, [isStreaming, open, hasAutoClosed]);

	if (!reasoning?.text) return null;

	const headerLabel = isStreaming
		? "深度思考中…"
		: duration !== undefined
			? `深度思考耗时 ${duration} 秒`
			: "推理过程";

	const handleCopy = () => {
		navigator.clipboard.writeText(reasoning.text ?? "");
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div className="mb-2 rounded-2xl border border-violet-500/15 bg-violet-50 dark:bg-violet-950/20 overflow-hidden transition-all duration-300">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-violet-500/5 transition-colors group cursor-pointer"
			>
				<span className="relative flex h-2.5 w-2.5 shrink-0">
					{isStreaming ? (
						<>
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
							<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500" />
						</>
					) : (
						<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500/50" />
					)}
				</span>
				<span className="text-[11px] font-semibold text-violet-600/80 dark:text-violet-400/80 tracking-widest uppercase select-none">
					{headerLabel}
				</span>
				{!isStreaming && !open && reasoning.text && (
					<span className="ml-1 text-[10px] text-violet-500/60 dark:text-violet-500/40 truncate max-w-[200px] hidden sm:block">
						{reasoning.text.slice(0, 60).replace(/\n/g, " ")}…
					</span>
				)}
				<ChevronDown
					className={`ml-auto h-3 w-3 text-violet-500/40 transition-transform duration-200 group-hover:text-violet-400/60 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{open && (
				<div className="border-t border-violet-500/10">
					<div
						className="relative max-h-72 overflow-y-auto px-4 py-3"
						ref={(el) => {
							// Auto-scroll to bottom while streaming
							if (el && isStreaming) el.scrollTop = el.scrollHeight;
						}}
					>
						<p className="text-[11px] leading-relaxed text-violet-800/70 dark:text-violet-300/60 font-mono whitespace-pre-wrap">
							{reasoning.text}
						</p>
					</div>
					<div className="flex justify-end px-4 py-2 border-t border-violet-500/10">
						<button
							type="button"
							onClick={handleCopy}
							className="flex items-center gap-1.5 text-[10px] text-violet-600/60 dark:text-violet-500/50 hover:text-violet-600 dark:hover:text-violet-400/80 transition-colors cursor-pointer"
						>
							{copied ? (
								<Check className="h-3 w-3 text-green-500 dark:text-green-400" />
							) : (
								<Copy className="h-3 w-3" />
							)}
							{copied ? "已复制" : "复制该步骤"}
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

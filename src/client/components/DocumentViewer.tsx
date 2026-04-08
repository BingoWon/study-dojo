import { Eraser, Loader2, Mic, Sparkles } from "lucide-react";
import Mark from "mark.js";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { HighlightItem } from "../Chat";

// ── Highlight colors ────────────────────────────────────────────────────────

const HL_COLORS = [
	{ name: "yellow", dot: "bg-yellow-400", markClass: "hl-yellow" },
	{ name: "red", dot: "bg-red-400", markClass: "hl-red" },
	{ name: "green", dot: "bg-emerald-400", markClass: "hl-green" },
	{ name: "blue", dot: "bg-blue-400", markClass: "hl-blue" },
	{ name: "purple", dot: "bg-violet-400", markClass: "hl-purple" },
];

function getHlMarkClass(color: string) {
	return (
		HL_COLORS.find((c) => c.name === color)?.markClass ?? HL_COLORS[0].markClass
	);
}

// ── Markdown components ─────────────────────────────────────────────────────

const mdComponents = {
	a: ({
		children,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a {...props} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	),
};

// ── DocumentViewer ──────────────────────────────────────────────────────────

export const DocumentViewer: FC<{
	docId: string;
	viewLang: "original" | "zh";
	highlights: HighlightItem[];
	scrollToHlId?: string | null;
	onScrollToHlDone?: () => void;
	onAddHighlight?: (text: string, color: string) => void;
	onClearHighlights?: () => void;
	onVoiceRead?: () => void;
	isVoiceActive?: boolean;
	onDialogue?: () => void;
	isDialogueActive?: boolean;
}> = ({
	docId,
	viewLang,
	highlights,
	scrollToHlId,
	onScrollToHlDone,
	onAddHighlight,
	onClearHighlights,
	onVoiceRead,
	isVoiceActive,
	onDialogue,
	isDialogueActive,
}) => {
	const [markdown, setMarkdown] = useState<string | null>(null);
	const [chunks, setChunks] = useState<string[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const markRef = useRef<Mark | null>(null);

	// Selection toolbar state
	const [selToolbar, setSelToolbar] = useState<{
		x: number;
		y: number;
		text: string;
	} | null>(null);

	// ── Data fetching (with Cache API for large immutable docs) ──────────
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		setMarkdown(null);
		setChunks(null);

		const mdUrl =
			viewLang === "zh"
				? `/api/documents/${docId}/markdown?lang=zh`
				: `/api/documents/${docId}/markdown`;
		const chunkUrl = `/api/documents/${docId}/chunks`;

		/** Fetch with Cache API: serve from cache if available, else fetch + cache. */
		const cachedFetch = async (url: string): Promise<Response> => {
			try {
				const cache = await caches.open("doc-content");
				const cached = await cache.match(url);
				if (cached) return cached;
				const res = await fetch(url);
				if (res.ok) {
					// Clone before caching since body can only be consumed once
					cache.put(url, res.clone());
				}
				return res;
			} catch {
				// Cache API unavailable (e.g. Firefox private mode) — fall back
				return fetch(url);
			}
		};

		Promise.all([
			cachedFetch(mdUrl).then((r) => (r.ok ? r.text() : null)),
			cachedFetch(chunkUrl)
				.then((r) => (r.ok ? r.json() : null))
				.then((data) => (data as { chunks: string[] } | null)?.chunks ?? null),
		])
			.then(([md, ch]) => {
				if (cancelled) return;
				setMarkdown(md);
				setChunks(ch);
				setLoading(false);
				if (!md && !ch) setError("加载失败");
			})
			.catch(() => {
				if (!cancelled) {
					setError("加载失败");
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [docId, viewLang]);

	// ── mark.js: create instance after content renders ────────────────────
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-create when content changes
	useEffect(() => {
		if (!contentRef.current || loading) return;
		markRef.current = new Mark(contentRef.current);
		return () => {
			markRef.current = null;
		};
	}, [loading, markdown, chunks]);

	// ── Apply all highlights via mark.js ──────────────────────────────────
	useEffect(() => {
		const m = markRef.current;
		if (!m || loading) return;

		m.unmark({
			done: () => {
				for (const hl of highlights) {
					const hlClass = getHlMarkClass(hl.color);
					// Use data attribute for reliable querying (CSS class selectors
					// break with UUIDs that start with digits after the prefix)
					const markOpts = {
						element: "mark",
						className: `doc-hl ${hlClass}`,
						acrossElements: true,
						separateWordSearch: false,
						each: (el: Element) => {
							(el as HTMLElement).dataset.hlId = hl.id;
						},
					};

					if (!hl.text) {
						m.markRegExp(/.+/g, markOpts);
					} else {
						// Split by line breaks, strip markdown syntax that doesn't
						// appear in the rendered DOM (checkboxes, bullets, headers, etc.)
						const lines = hl.text
							.split(/\n+/)
							.map((l) =>
								l
									.replace(/^#{1,6}\s+/, "") // ## heading
									.replace(/^[-*+]\s+(\[[ x]]\s+)?/, "") // - [ ] checkbox / - bullet
									.replace(/^\d+\.\s+/, "") // 1. ordered list
									.replace(/^>\s+/, "") // > blockquote
									.replace(/\*\*(.+?)\*\*/g, "$1") // **bold**
									.replace(/\*(.+?)\*/g, "$1") // *italic*
									.replace(/`(.+?)`/g, "$1") // `code`
									.trim(),
							)
							.filter(Boolean);
						for (const line of lines) {
							let found = false;
							m.mark(line, {
								...markOpts,
								accuracy: "exactly",
								each: (el: Element) => {
									(el as HTMLElement).dataset.hlId = hl.id;
									found = true;
								},
							});
							if (!found) {
								m.mark(line, {
									...markOpts,
									accuracy: "partially",
								});
							}
						}
					}
				}

				// Scroll to the target highlight — use container.scrollTo
				// instead of scrollIntoView to prevent parent elements from scrolling
				if (scrollToHlId && scrollRef.current) {
					const el = contentRef.current?.querySelector(
						`[data-hl-id="${scrollToHlId}"]`,
					);
					if (el) {
						const container = scrollRef.current;
						const elRect = el.getBoundingClientRect();
						const cRect = container.getBoundingClientRect();
						const target =
							container.scrollTop +
							elRect.top -
							cRect.top -
							cRect.height / 2 +
							elRect.height / 2;
						container.scrollTo({ top: target, behavior: "smooth" });
					}
					onScrollToHlDone?.();
				}
			},
		});
	}, [highlights, loading, scrollToHlId, onScrollToHlDone]);

	// ── Selection tracking for floating toolbar ──────────────────────────
	const handleMouseUp = useCallback(() => {
		const sel = window.getSelection();
		const text = sel?.toString().trim();
		if (!text || !sel?.rangeCount) {
			setSelToolbar(null);
			return;
		}
		const range = sel.getRangeAt(0);
		if (!contentRef.current?.contains(range.commonAncestorContainer)) {
			setSelToolbar(null);
			return;
		}

		const container = scrollRef.current;
		if (!container) return;
		const containerRect = container.getBoundingClientRect();

		// Use the first line rect for positioning (not the full bounding box)
		const rects = range.getClientRects();
		const firstRect =
			rects.length > 0 ? rects[0] : range.getBoundingClientRect();

		setSelToolbar({
			x: firstRect.left + firstRect.width / 2 - containerRect.left,
			y: firstRect.top - containerRect.top + container.scrollTop - 12,
			text,
		});
	}, []);

	// Dismiss on scroll
	useEffect(() => {
		const dismiss = () => setSelToolbar(null);
		const container = scrollRef.current;
		if (!container) return;
		container.addEventListener("scroll", dismiss, { passive: true });
		return () => container.removeEventListener("scroll", dismiss);
	}, []);

	// Dismiss on click outside content (but not on toolbar itself)
	const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
		const target = e.target as HTMLElement;
		if (target.closest("[data-hl-toolbar]")) return;
		// Will be handled by mouseup if it's a selection
	}, []);

	const handleToolbarColor = useCallback(
		(color: string) => {
			if (!selToolbar) return;
			onAddHighlight?.(selToolbar.text, color);
			window.getSelection()?.removeAllRanges();
			setSelToolbar(null);
		},
		[onAddHighlight, selToolbar],
	);

	// ── Render ────────────────────────────────────────────────────────────
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

	const showChunks = viewLang !== "zh" && chunks && chunks.length > 0;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: text selection tracking
		<div
			ref={scrollRef}
			className="flex-1 overflow-y-auto overflow-x-hidden py-6 relative"
			onMouseUp={handleMouseUp}
			onMouseDown={handleContainerMouseDown}
		>
			{/* Floating companion buttons (vertical stack) */}
			{(onVoiceRead || onDialogue) && (
				<div className="sticky top-0 z-20 pointer-events-none h-0">
					<div className="absolute right-4 top-2 pointer-events-auto flex flex-col gap-1.5">
						{onVoiceRead && (
							<button
								type="button"
								onClick={onVoiceRead}
								className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-md transition-all cursor-pointer ${
									isVoiceActive
										? "bg-purple-500 text-white shadow-purple-500/25"
										: "bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/30 hover:shadow-lg"
								}`}
							>
								<Mic className="w-3.5 h-3.5" />
								{isVoiceActive ? "语音对话中" : "语音伴读"}
							</button>
						)}
						{onDialogue && (
							<button
								type="button"
								onClick={onDialogue}
								className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-md transition-all cursor-pointer ${
									isDialogueActive
										? "bg-amber-500 text-white shadow-amber-500/25"
										: "bg-white dark:bg-zinc-800 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:shadow-lg"
								}`}
							>
								<Sparkles className="w-3.5 h-3.5" />
								{isDialogueActive ? "剧情对话中" : "剧情伴读"}
							</button>
						)}
					</div>
				</div>
			)}

			{/* Clear all highlights button */}
			{highlights.length > 0 && onClearHighlights && (
				<div className="sticky top-0 z-10 pointer-events-none h-0">
					<div
						className={`absolute right-4 pointer-events-auto ${onVoiceRead && onDialogue ? "top-[5.5rem]" : onVoiceRead || onDialogue ? "top-12" : "top-2"}`}
					>
						<button
							type="button"
							onClick={onClearHighlights}
							className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-zinc-500 dark:text-zinc-400 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm shadow-sm border border-zinc-200/50 dark:border-zinc-700/50 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
						>
							<Eraser className="w-3 h-3" />
							清除高亮 ({highlights.length})
						</button>
					</div>
				</div>
			)}

			{/* Floating selection toolbar */}
			{selToolbar && onAddHighlight && (
				<div
					data-hl-toolbar
					className="absolute z-20 flex items-center gap-2 px-3 py-2.5 rounded-full bg-white/95 dark:bg-zinc-800/95 shadow-xl backdrop-blur-sm border border-zinc-200/50 dark:border-zinc-700/50 animate-in fade-in zoom-in-95 duration-150"
					style={{
						left: selToolbar.x,
						top: selToolbar.y,
						transform: "translate(-50%, -100%)",
					}}
				>
					{HL_COLORS.map((c) => (
						<button
							key={c.name}
							type="button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => handleToolbarColor(c.name)}
							className={`w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-125 ring-1 ring-black/10 dark:ring-white/10 ${c.dot}`}
						/>
					))}
					<button
						type="button"
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => {
							onClearHighlights?.();
							window.getSelection()?.removeAllRanges();
							setSelToolbar(null);
						}}
						className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-125 bg-zinc-100 dark:bg-zinc-700 ring-1 ring-black/10 dark:ring-white/10"
					>
						<Eraser className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />
					</button>
					<div className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-2.5 h-2.5 bg-white/95 dark:bg-zinc-800/95 border-r border-b border-zinc-200/50 dark:border-zinc-700/50 rotate-45 rounded-[1px]" />
				</div>
			)}

			<div ref={contentRef} className="max-w-3xl mx-auto px-8">
				{showChunks ? (
					<div className="relative">
						{chunks.map((chunk, i) => {
							// Remove overlap: if this chunk starts with the tail of the
							// previous chunk, trim the duplicated prefix.
							let display = chunk;
							if (i > 0) {
								const prev = chunks[i - 1];
								// Check suffix/prefix overlap (up to 300 chars to cover 256 overlap + margin)
								const tail = prev.slice(-300);
								let best = 0;
								for (let len = 20; len <= tail.length; len++) {
									if (chunk.startsWith(tail.slice(-len))) best = len;
								}
								if (best > 0) display = chunk.slice(best);
							}
							const chunkKey =
								chunk.slice(0, 32).replace(/\W/g, "") || String(i);
							return (
								<ChunkBlock
									key={chunkKey}
									index={i}
									total={chunks.length}
									content={display}
								/>
							);
						})}
					</div>
				) : (
					<div className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-200 dark:prose-pre:border-zinc-800">
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							components={mdComponents}
						>
							{markdown ?? ""}
						</ReactMarkdown>
					</div>
				)}
			</div>
		</div>
	);
};

// ── Chunk Block with sticky gutter label ────────────────────────────────────

const ChunkBlock: FC<{
	index: number;
	total: number;
	content: string;
}> = ({ index, total, content }) => {
	const blockRef = useRef<HTMLDivElement>(null);
	const dividerRef = useRef<HTMLDivElement>(null);
	const [labelSticky, setLabelSticky] = useState(false);

	const updateSticky = useCallback(() => {
		const divider = dividerRef.current;
		const block = blockRef.current;
		if (!block || !divider) return;
		const container = block.closest(".overflow-y-auto");
		if (!container) return;
		const containerRect = container.getBoundingClientRect();
		const dividerRect = divider.getBoundingClientRect();
		setLabelSticky(dividerRect.bottom > containerRect.bottom);
	}, []);

	useEffect(() => {
		const container = blockRef.current?.closest(".overflow-y-auto");
		if (!container) return;
		container.addEventListener("scroll", updateSticky, { passive: true });
		updateSticky();
		return () => container.removeEventListener("scroll", updateSticky);
	}, [updateSticky]);

	return (
		<div ref={blockRef} className="group/chunk relative">
			<div className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-200 dark:prose-pre:border-zinc-800">
				<ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
					{content}
				</ReactMarkdown>
			</div>

			{labelSticky && (
				<div className="sticky bottom-4 z-10 h-0 pointer-events-none">
					<div className="absolute right-full mr-2 bottom-0 select-none whitespace-nowrap">
						<span className="text-[10px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm">
							块:{index + 1}/{total}
						</span>
					</div>
				</div>
			)}

			<div ref={dividerRef} className="relative mt-4 mb-4">
				<div className="absolute right-full mr-2 bottom-0 select-none whitespace-nowrap">
					<span className="text-[10px] font-mono tabular-nums text-zinc-300 dark:text-zinc-600 group-hover/chunk:text-zinc-500 dark:group-hover/chunk:text-zinc-400 transition-colors bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm px-1.5 py-0.5 rounded">
						块:{index + 1}/{total}
					</span>
				</div>
				<div className="border-t border-dashed border-zinc-200 dark:border-zinc-800 group-hover/chunk:border-zinc-400 dark:group-hover/chunk:border-zinc-600 transition-colors" />
			</div>
		</div>
	);
};

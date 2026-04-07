import { useAuiState } from "@assistant-ui/react";
import { Show, SignInButton, SignUpButton } from "@clerk/react";
import {
	BookOpen,
	Check,
	Copy,
	Globe,
	Languages,
	Maximize2,
	Minimize2,
	X,
} from "lucide-react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { Chat, type HighlightAction, type HighlightItem } from "./Chat";
import { CollapsedHandle } from "./components/CollapsedHandle";
import { DialogueThread } from "./components/DialogueThread";
import { Divider } from "./components/Divider";
import { DocumentViewer } from "./components/DocumentViewer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeToggle } from "./components/ThemeToggle";
import {
	type SidebarTab,
	ThreadListSidebar,
} from "./components/ThreadListSidebar";
import { VoiceThread } from "./components/VoiceThread";
import { useResizableLayout } from "./hooks/useResizableLayout";
import { useUrlSync } from "./hooks/useUrlSync";
import { getFileIcon } from "./lib/file-icons";
import {
	RuntimeProvider,
	useDialogueMode,
	usePersona,
	useVoiceMode,
} from "./RuntimeProvider";

function ssRead<T>(key: string, fallback: T): T {
	try {
		const v = sessionStorage.getItem(key);
		return v ? JSON.parse(v) : fallback;
	} catch {
		return fallback;
	}
}

function ssWrite(key: string, value: unknown) {
	try {
		sessionStorage.setItem(key, JSON.stringify(value));
	} catch {}
}

type OpenDoc = {
	id: string;
	title: string;
	lang?: string | null;
	fileExt?: string | null;
};

function App() {
	const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
	// Active tab & open docs — persisted in sessionStorage
	const [activeTab, setActiveTab] = useState<string>(() =>
		ssRead("center:activeTab", ""),
	);
	const [openDocs, setOpenDocs] = useState<OpenDoc[]>(() =>
		ssRead("center:openDocs", []),
	);
	const [viewLang, setViewLang] = useState<"original" | "zh">("zh");

	useEffect(() => ssWrite("center:activeTab", activeTab), [activeTab]);
	useEffect(() => ssWrite("center:openDocs", openDocs), [openDocs]);
	const containerRef = useRef<HTMLDivElement>(null);
	const layout = useResizableLayout(containerRef);

	const activeDoc = openDocs.find((d) => d.id === activeTab) ?? null;

	const handleDocSelect = useCallback(
		(
			docId: string,
			title: string,
			lang?: string | null,
			fileExt?: string | null,
		) => {
			setOpenDocs((prev) => {
				if (prev.some((d) => d.id === docId)) return prev;
				return [...prev, { id: docId, title, lang, fileExt }];
			});
			setViewLang(lang === "en" ? "zh" : "original");
			setActiveTab(docId);
		},
		[],
	);

	const handleCloseDoc = useCallback(
		(docId: string, e?: React.MouseEvent) => {
			e?.stopPropagation();
			setOpenDocs((prev) => prev.filter((d) => d.id !== docId));
			// If closing the active tab, fall back
			setActiveTab((cur) => {
				if (cur !== docId) return cur;
				// Find next tab: prefer right neighbor, then left, then empty
				const idx = openDocs.findIndex((d) => d.id === docId);
				if (openDocs.length > 1) {
					const next = openDocs[idx + 1] ?? openDocs[idx - 1];
					return next.id;
				}
				return "";
			});
		},
		[openDocs],
	);

	// Highlight state: per-document, multiple highlights
	const [highlights, setHighlights] = useState<Map<string, HighlightItem[]>>(
		() => new Map(ssRead<[string, HighlightItem[]][]>("doc:highlights", [])),
	);
	useEffect(
		() => ssWrite("doc:highlights", [...highlights.entries()]),
		[highlights],
	);

	// scrollToHighlight: set after AI highlight to trigger scroll in viewer
	const [scrollToHl, setScrollToHl] = useState<string | null>(null);

	const handleHighlight = useCallback(
		(action: HighlightAction) => {
			const { docId, text, color, title, lang, fileExt } = action;

			// Clear all highlights for this doc
			if (color === "transparent" && !text) {
				setHighlights((prev) => {
					const next = new Map(prev);
					next.delete(docId);
					return next;
				});
				return;
			}

			// Mainstream highlight behavior: same text → replace color;
			// exact duplicate (text+color) → skip (prevents re-trigger on
			// thread switch when tool UIs re-mount)
			const newItemId = crypto.randomUUID();
			let added = false;
			setHighlights((prev) => {
				const next = new Map(prev);
				const existing = next.get(docId) ?? [];
				const dup = existing.find((h) => h.text === text);
				if (dup) {
					if (dup.color === color) return prev; // exact duplicate
					// Same text, different color → replace
					added = true;
					next.set(
						docId,
						existing.map((h) =>
							h.id === dup.id ? { id: newItemId, text, color } : h,
						),
					);
				} else {
					added = true;
					next.set(docId, [...existing, { id: newItemId, text, color }]);
				}
				return next;
			});

			// Auto-open and activate the doc, then scroll to it
			handleDocSelect(docId, title, lang, fileExt);
			if (added) setScrollToHl(newItemId);
		},
		[handleDocSelect],
	);

	const handleClearDocHighlights = useCallback((docId: string) => {
		setHighlights((prev) => {
			const next = new Map(prev);
			next.delete(docId);
			return next;
		});
	}, []);

	const handleAddHighlight = useCallback(
		(docId: string, text: string, color: string) => {
			const item: HighlightItem = { id: crypto.randomUUID(), text, color };
			setHighlights((prev) => {
				const next = new Map(prev);
				const existing = next.get(docId) ?? [];
				next.set(docId, [...existing, item]);
				return next;
			});
		},
		[],
	);

	return (
		<main className="h-screen w-screen bg-[#dedee9] dark:bg-[#1a1a2e] text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30 flex transition-colors duration-300 relative">
			{/* Dojo-style gradient background circles */}
			<div
				className="absolute w-[446px] h-[446px] left-[65%] top-[1%] rounded-full z-0"
				style={{ background: "rgba(255, 172, 77, 0.2)", filter: "blur(103px)" }}
			/>
			<div
				className="absolute w-[609px] h-[609px] left-[85%] top-[60%] rounded-full z-0"
				style={{ background: "#C9C9DA", filter: "blur(103px)" }}
			/>
			<div
				className="absolute w-[609px] h-[609px] left-[40%] top-[-30%] rounded-full z-0"
				style={{ background: "#C9C9DA", filter: "blur(103px)" }}
			/>
			<div
				className="absolute w-[609px] h-[609px] left-[30%] top-[70%] rounded-full z-0"
				style={{ background: "#F3F3FC", filter: "blur(103px)" }}
			/>
			<div
				className="absolute w-[446px] h-[446px] left-[8%] top-[30%] rounded-full z-0"
				style={{
					background: "rgba(255, 243, 136, 0.3)",
					filter: "blur(103px)",
				}}
			/>
			<div
				className="absolute w-[446px] h-[446px] left-[-10%] top-[80%] rounded-full z-0"
				style={{ background: "rgba(255, 172, 77, 0.2)", filter: "blur(103px)" }}
			/>

			<Show when="signed-out">
				<div className="absolute top-4 right-4 z-50">
					<ThemeToggle />
				</div>
				<div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full w-full z-10">
					<div className="max-w-md w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
						<div className="w-20 h-20 bg-purple-500/10 dark:bg-purple-500/20 text-purple-500 dark:text-purple-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm ring-1 ring-purple-500/20 text-4xl">
							⚡
						</div>
						<h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
							雷电教授
						</h1>
						<p className="text-zinc-500 dark:text-zinc-400 text-lg leading-relaxed">
							AI
							论文陪读导师，多角色人设，陪你在知识的海洋里畅游。登录以开始你的学术之旅。
						</p>
						<div className="flex flex-col sm:flex-row gap-3 pt-6 justify-center">
							<SignInButton mode="modal">
								<button
									type="button"
									className="flex-1 sm:flex-none flex items-center justify-center px-8 py-3.5 text-sm font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition cursor-pointer text-zinc-800 dark:text-zinc-100 ring-1 ring-zinc-300 dark:ring-zinc-700"
								>
									立即登录
								</button>
							</SignInButton>
							<SignUpButton mode="modal">
								<button
									type="button"
									className="flex-1 sm:flex-none flex items-center justify-center px-8 py-3.5 text-sm font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 rounded-full transition cursor-pointer shadow-lg shadow-zinc-900/20 dark:shadow-white/10"
								>
									免费注册
								</button>
							</SignUpButton>
						</div>
					</div>
				</div>
			</Show>

			<Show when="signed-in">
				<RuntimeProvider>
					<UrlSync sidebarTab={sidebarTab} setSidebarTab={setSidebarTab} />
					<div
						ref={containerRef}
						className={`flex-1 flex h-full overflow-hidden pt-2 pb-2 gap-1.5 z-10 ${layout.leftCollapsed ? "pl-0" : "pl-2"} ${layout.rightCollapsed ? "pr-0" : "pr-2"}`}
					>
						{/* 左栏 (always in DOM for width transition) */}
						{layout.leftCollapsed && !layout.immersive && (
							<CollapsedHandle direction="left" onClick={layout.toggleLeft} />
						)}
						<div
							style={{
								width: layout.leftCollapsed ? 0 : layout.leftWidth,
								opacity: layout.leftCollapsed ? 0 : 1,
							}}
							className="h-full flex-shrink-0 overflow-hidden rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-white/60 dark:border-zinc-700/50 transition-[width,opacity] duration-300 ease-out"
						>
							<div className="h-full min-w-[200px]">
								<ThreadListSidebar
									activeDocId={activeDoc?.id ?? null}
									activeTab={sidebarTab}
									setActiveTab={setSidebarTab}
									onDocSelect={handleDocSelect}
								/>
							</div>
						</div>

						{/* 左分割线 */}
						{!layout.leftCollapsed && <Divider {...layout.leftDividerProps} />}

						{/* 中间面板（tab 切换） */}
						<div className="flex-1 h-full flex flex-col min-w-0 rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-white/60 dark:border-zinc-700/50 overflow-hidden">
							{/* Tab bar */}
							<div className="flex items-center justify-between px-3 pt-2 pb-2 border-b border-divider dark:border-divider-dark flex-shrink-0">
								<div className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none">
									{/* Document tabs */}
									{openDocs.map((doc) => {
										const isActive = activeTab === doc.id;
										const Icon = getFileIcon(doc.fileExt);
										return (
											<div
												role="tab"
												tabIndex={0}
												key={doc.id}
												onClick={() => {
													setActiveTab(doc.id);
													setViewLang(doc.lang === "en" ? "zh" : "original");
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														setActiveTab(doc.id);
														setViewLang(doc.lang === "en" ? "zh" : "original");
													}
												}}
												className={`group flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shrink-0 max-w-[180px] ${
													isActive
														? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
														: "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
												}`}
											>
												<Icon className="w-3.5 h-3.5 shrink-0" />
												<span className="truncate">{doc.title}</span>
												<button
													type="button"
													tabIndex={0}
													onClick={(e) => handleCloseDoc(doc.id, e)}
													onKeyDown={(e) => {
														if (e.key === "Enter") handleCloseDoc(doc.id);
													}}
													className={`shrink-0 p-0.5 rounded-sm transition-colors ${
														isActive
															? "text-white/60 dark:text-zinc-900/60 hover:text-white dark:hover:text-zinc-900 hover:bg-white/20 dark:hover:bg-zinc-900/20"
															: "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
													}`}
												>
													<X className="w-3 h-3" />
												</button>
											</div>
										);
									})}
								</div>

								{/* Document toolbar */}
								{activeDoc && (
									<div className="flex items-center gap-1.5 ml-2 shrink-0">
										{/* Language toggle (English only) */}
										{activeDoc.lang === "en" && (
											<div className="flex items-center rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
												<button
													type="button"
													onClick={() => setViewLang("zh")}
													className={`flex items-center gap-1 px-2.5 py-[3px] rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
														viewLang === "zh"
															? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
															: "text-zinc-500 dark:text-zinc-400"
													}`}
												>
													<Languages className="w-3 h-3" />
													中文翻译
												</button>
												<button
													type="button"
													onClick={() => setViewLang("original")}
													className={`flex items-center gap-1 px-2.5 py-[3px] rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
														viewLang === "original"
															? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
															: "text-zinc-500 dark:text-zinc-400"
													}`}
												>
													<Globe className="w-3 h-3" />
													英文原文
												</button>
											</div>
										)}

										{/* Copy full text */}
										<CopyButton
											docId={activeDoc.id}
											viewLang={activeDoc.lang === "en" ? viewLang : "original"}
										/>

										{/* Focus mode */}
										<button
											type="button"
											onClick={
												layout.immersive
													? layout.exitImmersive
													: layout.enterImmersive
											}
											className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
											title={layout.immersive ? "退出全屏" : "全屏阅读"}
										>
											{layout.immersive ? (
												<Minimize2 className="w-3.5 h-3.5" />
											) : (
												<Maximize2 className="w-3.5 h-3.5" />
											)}
										</button>
									</div>
								)}
							</div>

							{/* 内容区 */}
							{!activeDoc && (
								<div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
									<div className="text-zinc-300 dark:text-zinc-700">
										<BookOpen className="w-12 h-12 mx-auto" />
									</div>
									<p className="text-sm text-zinc-400 dark:text-zinc-500">
										暂无打开的文档
									</p>
									<p className="text-xs text-zinc-400/60 dark:text-zinc-500/60 max-w-[260px] leading-relaxed">
										在左侧文档栏上传文档并打开，即可在这里与喜欢的角色进入语音伴读和剧情模式讨论文档
									</p>
								</div>
							)}
							{activeDoc && (
								<DocViewerWithVoice
									doc={activeDoc}
									viewLang={activeDoc.lang === "en" ? viewLang : "original"}
									highlights={highlights.get(activeDoc.id) ?? []}
									scrollToHlId={scrollToHl}
									onScrollToHlDone={() => setScrollToHl(null)}
									onAddHighlight={(text, color) =>
										handleAddHighlight(activeDoc.id, text, color)
									}
									onClearHighlights={() =>
										handleClearDocHighlights(activeDoc.id)
									}
								/>
							)}
						</div>

						{/* 右分割线 */}
						{!layout.rightCollapsed && (
							<Divider {...layout.rightDividerProps} />
						)}

						{/* 右栏 (always in DOM for width transition) */}
						{layout.rightCollapsed && !layout.immersive && (
							<CollapsedHandle direction="right" onClick={layout.toggleRight} />
						)}
						<div
							style={{
								width: layout.rightCollapsed ? 0 : layout.rightWidth,
								opacity: layout.rightCollapsed ? 0 : 1,
							}}
							className="h-full flex-shrink-0 overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-700/50 transition-[width,opacity] duration-300 ease-out"
						>
							<div className="h-full min-w-[280px]">
								<ErrorBoundary>
									<RightPanel
										onDocSelect={handleDocSelect}
										onHighlight={handleHighlight}
									/>
								</ErrorBoundary>
							</div>
						</div>
					</div>
					{/* Dialogue mode: fixed bottom overlay (outside flex layout) */}
					<DialogueOverlay
						onEnter={layout.enterImmersive}
						onExit={layout.exitImmersive}
					/>
				</RuntimeProvider>
			</Show>
		</main>
	);
}

// ── Copy Button ─────────────────────────────────────────────────────────────

const CopyButton: FC<{ docId: string; viewLang: "original" | "zh" }> = ({
	docId,
	viewLang,
}) => {
	const [copied, setCopied] = useState(false);
	const handleCopy = async () => {
		try {
			const url =
				viewLang === "zh"
					? `/api/documents/${docId}/markdown?lang=zh`
					: `/api/documents/${docId}/markdown`;
			const res = await fetch(url);
			if (!res.ok) return;
			const text = await res.text();
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {}
	};
	return (
		<button
			type="button"
			onClick={handleCopy}
			className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
			title="复制全文"
		>
			{copied ? (
				<Check className="w-3.5 h-3.5 text-emerald-500" />
			) : (
				<Copy className="w-3.5 h-3.5" />
			)}
		</button>
	);
};

// Renders nothing — just runs the URL sync hook inside RuntimeProvider context
const UrlSync: FC<{
	sidebarTab: SidebarTab;
	setSidebarTab: (tab: SidebarTab) => void;
}> = ({ sidebarTab, setSidebarTab }) => {
	useUrlSync(sidebarTab, setSidebarTab);
	return null;
};

// ── Document Viewer with Voice (bridges voice context into DocumentViewer) ──

const DocViewerWithVoice: FC<{
	doc: OpenDoc;
	viewLang: "original" | "zh";
	highlights: HighlightItem[];
	scrollToHlId?: string | null;
	onScrollToHlDone?: () => void;
	onAddHighlight?: (text: string, color: string) => void;
	onClearHighlights?: () => void;
}> = ({ doc, ...rest }) => {
	const { voiceMode, enterVoiceMode, exitVoiceMode } = useVoiceMode();
	const { dialogueMode, enterDialogueMode, exitDialogueMode } =
		useDialogueMode();
	const threadId = useAuiState(
		(s) => s.threadListItem.remoteId as string | undefined,
	);

	return (
		<DocumentViewer
			docId={doc.id}
			{...rest}
			onVoiceRead={() =>
				voiceMode.active ? exitVoiceMode() : enterVoiceMode(threadId)
			}
			isVoiceActive={voiceMode.active}
			onDialogue={() =>
				dialogueMode.active ? exitDialogueMode() : enterDialogueMode(threadId)
			}
			isDialogueActive={dialogueMode.active}
		/>
	);
};

// ── Dialogue Overlay (fixed bottom, outside flex layout) ─────────────────────

const DialogueOverlay: FC<{
	onEnter: () => void;
	onExit: () => void;
}> = ({ onEnter, onExit }) => {
	const { dialogueMode, exitDialogueMode } = useDialogueMode();
	const { persona } = usePersona();
	const prevActiveRef = useRef(false);

	// Auto-enter/exit immersive mode with dialogue
	useEffect(() => {
		if (dialogueMode.active && !prevActiveRef.current) {
			onEnter();
		}
		if (!dialogueMode.active && prevActiveRef.current) {
			onExit();
		}
		prevActiveRef.current = dialogueMode.active;
	}, [dialogueMode.active, onEnter, onExit]);

	if (!dialogueMode.active) return null;

	return (
		<div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none animate-in slide-in-from-bottom-4 fade-in duration-300">
			<DialogueThread persona={persona} onExit={exitDialogueMode} />
		</div>
	);
};

// ── Right Panel (switches between Chat and VoiceThread) ─────────────────────

const RightPanel: FC<{
	onDocSelect?: (
		docId: string,
		title: string,
		lang?: string | null,
		fileExt?: string | null,
	) => void;
	onHighlight?: (action: HighlightAction) => void;
}> = (props) => {
	const { voiceMode, exitVoiceMode } = useVoiceMode();

	if (voiceMode.active) {
		return (
			<VoiceThread
				docTitle={voiceMode.docTitle ?? "语音伴读"}
				systemPrompt={voiceMode.systemPrompt ?? ""}
				onExit={(msgs) => exitVoiceMode(msgs)}
			/>
		);
	}

	return (
		<Chat onDocSelect={props.onDocSelect} onHighlight={props.onHighlight} />
	);
};

export default App;

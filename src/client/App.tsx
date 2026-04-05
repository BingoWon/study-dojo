import { Show, SignInButton, SignUpButton } from "@clerk/react";
import {
	Check,
	ChefHat,
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
import { Divider } from "./components/Divider";
import { DocumentViewer } from "./components/DocumentViewer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
	INITIAL_RECIPE,
	type Recipe,
	RecipePanel,
} from "./components/RecipePanel";
import { ThemeToggle } from "./components/ThemeToggle";
import {
	type SidebarTab,
	ThreadListSidebar,
} from "./components/ThreadListSidebar";
import { useResizableLayout } from "./hooks/useResizableLayout";
import { useUrlSync } from "./hooks/useUrlSync";
import { getFileIcon } from "./lib/file-icons";
import { RuntimeProvider } from "./RuntimeProvider";

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
	const [recipe, setRecipe] = useState<Recipe>(INITIAL_RECIPE);
	const [changedKeys, setChangedKeys] = useState<string[]>([]);
	const [isAiLoading, setIsAiLoading] = useState(false);
	const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
	// Active tab & open docs — persisted in sessionStorage
	const [activeTab, setActiveTab] = useState<string>(() =>
		ssRead("center:activeTab", "recipe"),
	);
	const [openDocs, setOpenDocs] = useState<OpenDoc[]>(() =>
		ssRead("center:openDocs", []),
	);
	const [viewLang, setViewLang] = useState<"original" | "zh">("zh");

	useEffect(() => ssWrite("center:activeTab", activeTab), [activeTab]);
	useEffect(() => ssWrite("center:openDocs", openDocs), [openDocs]);
	const improveRef = useRef<(() => void) | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const layout = useResizableLayout(containerRef);

	const activeDoc = openDocs.find((d) => d.id === activeTab) ?? null;

	const handleRecipeUpdate = useCallback((partial: Partial<Recipe>) => {
		setRecipe((prev) => {
			const next = { ...prev, ...partial };
			const keys = Object.keys(partial);
			setChangedKeys(keys);
			setTimeout(() => setChangedKeys([]), 2000);
			return next;
		});
	}, []);

	const handleImprove = useCallback(() => {
		improveRef.current?.();
	}, []);

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
				// Find next tab: prefer right neighbor, then left, then recipe
				const idx = openDocs.findIndex((d) => d.id === docId);
				if (openDocs.length > 1) {
					const next = openDocs[idx + 1] ?? openDocs[idx - 1];
					return next.id;
				}
				return "recipe";
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
						<div className="w-20 h-20 bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm ring-1 ring-blue-500/20">
							<svg
								className="w-10 h-10"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								role="img"
								aria-label="AI 食谱助手"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
						</div>
						<h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
							AI 食谱助手
						</h1>
						<p className="text-zinc-500 dark:text-zinc-400 text-lg leading-relaxed">
							智能食谱创建器，准备就绪。登录以保存您的对话历史并体验所有高级功能。
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
						{/* 左栏 */}
						{layout.leftCollapsed ? (
							!layout.focused && (
								<CollapsedHandle direction="left" onClick={layout.toggleLeft} />
							)
						) : (
							<div
								style={{ width: layout.leftWidth }}
								className="h-full flex-shrink-0 overflow-hidden rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-white/60 dark:border-zinc-700/50"
							>
								<ThreadListSidebar
									activeDocId={activeDoc?.id ?? null}
									activeTab={sidebarTab}
									onTabChange={setSidebarTab}
									onDocSelect={handleDocSelect}
								/>
							</div>
						)}

						{/* 左分割线 */}
						{!layout.leftCollapsed && <Divider {...layout.leftDividerProps} />}

						{/* 中间面板（tab 切换） */}
						<div className="flex-1 h-full flex flex-col min-w-0 rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-white/60 dark:border-zinc-700/50 overflow-hidden">
							{/* Tab bar */}
							<div className="flex items-center justify-between px-3 pt-2 pb-2 border-b border-divider dark:border-divider-dark flex-shrink-0">
								<div className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none">
									{/* Recipe tab (pinned) */}
									<button
										type="button"
										onClick={() => setActiveTab("recipe")}
										className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shrink-0 ${
											activeTab === "recipe"
												? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
												: "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
										}`}
									>
										<ChefHat className="w-3.5 h-3.5" />
										食谱
									</button>

									{/* Document tabs */}
									{openDocs.map((doc) => {
										const isActive = activeTab === doc.id;
										const Icon = getFileIcon(doc.fileExt);
										return (
											<button
												key={doc.id}
												type="button"
												onClick={() => {
													setActiveTab(doc.id);
													setViewLang(doc.lang === "en" ? "zh" : "original");
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
											</button>
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
											onClick={layout.toggleFocus}
											className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
											title={layout.focused ? "退出全屏" : "全屏阅读"}
										>
											{layout.focused ? (
												<Minimize2 className="w-3.5 h-3.5" />
											) : (
												<Maximize2 className="w-3.5 h-3.5" />
											)}
										</button>
									</div>
								)}
							</div>

							{/* 内容区 */}
							{activeTab === "recipe" && (
								<div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-4">
									<RecipePanel
										recipe={recipe}
										onUpdate={handleRecipeUpdate}
										isLoading={isAiLoading}
										changedKeys={changedKeys}
										onImprove={handleImprove}
									/>
								</div>
							)}
							{activeDoc && (
								<DocumentViewer
									docId={activeDoc.id}
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

						{/* 右栏 */}
						{layout.rightCollapsed ? (
							!layout.focused && (
								<CollapsedHandle
									direction="right"
									onClick={layout.toggleRight}
								/>
							)
						) : (
							<div
								style={{ width: layout.rightWidth }}
								className="h-full flex-shrink-0 overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-700/50"
							>
								<ErrorBoundary>
									<Chat
										recipe={recipe}
										onRecipeUpdate={handleRecipeUpdate}
										onDocSelect={handleDocSelect}
										onHighlight={handleHighlight}
										onLoadingChange={setIsAiLoading}
										registerImprove={(fn) => {
											improveRef.current = fn;
										}}
									/>
								</ErrorBoundary>
							</div>
						)}
					</div>
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

export default App;

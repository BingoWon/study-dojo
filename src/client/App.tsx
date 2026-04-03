import type { UIMessage as Message } from "@ai-sdk/react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import { ChefHat, FileText, Globe, Languages, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Chat } from "./Chat";
import { CollapsedHandle } from "./components/CollapsedHandle";
import { Divider } from "./components/Divider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PaperViewer } from "./components/PaperViewer";
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
import { useThreads } from "./lib/useThreads";

type CenterTab = "recipe" | "paper";

function App() {
	const {
		threads,
		activeThreadId,
		setActiveThreadId,
		createThread,
		deleteThread,
		setThreadTitle,
		updateThreadTitle,
		loading,
	} = useThreads();

	const [initialMessages, setInitialMessages] = useState<Message[]>([]);
	const [chatReady, setChatReady] = useState(false);
	const [recipe, setRecipe] = useState<Recipe>(INITIAL_RECIPE);
	const [changedKeys, setChangedKeys] = useState<string[]>([]);
	const [isAiLoading, setIsAiLoading] = useState(false);
	const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
	const [centerTab, setCenterTab] = useState<CenterTab>("recipe");
	const [selectedPaper, setSelectedPaper] = useState<{
		id: string;
		title: string;
		lang?: string | null;
	} | null>(null);
	const [viewLang, setViewLang] = useState<"original" | "zh">("zh");
	const improveRef = useRef<(() => void) | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const layout = useResizableLayout(containerRef);

	useEffect(() => {
		if (!activeThreadId) {
			setChatReady(false);
			return;
		}
		let cancelled = false;
		setChatReady(false);
		fetch(`/api/threads/${activeThreadId}/messages`)
			.then((res) => (res.ok ? res.json() : []))
			.then((msgs: unknown) => {
				if (cancelled) return;
				setInitialMessages(Array.isArray(msgs) ? (msgs as Message[]) : []);
				setChatReady(true);
			})
			.catch(() => {
				if (cancelled) return;
				setInitialMessages([]);
				setChatReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [activeThreadId]);

	const handleTitleUpdate = useCallback(
		(title: string) => {
			if (activeThreadId) setThreadTitle(activeThreadId, title);
		},
		[activeThreadId, setThreadTitle],
	);

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

	const handlePaperSelect = useCallback(
		(paperId: string, title: string, lang?: string | null) => {
			setSelectedPaper({ id: paperId, title, lang });
			setViewLang(lang === "en" ? "zh" : "original");
			setCenterTab("paper");
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

			<header className="absolute top-0 right-0 p-4 z-50 flex items-center justify-end gap-3">
				<ThemeToggle />
				<Show when="signed-in">
					<UserButton />
				</Show>
			</header>

			<Show when="signed-out">
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
				<div
					ref={containerRef}
					className={`flex-1 flex h-full overflow-hidden pt-2 pb-2 gap-1.5 z-10 ${layout.leftCollapsed ? "pl-0" : "pl-2"} ${layout.rightCollapsed ? "pr-0" : "pr-2"}`}
				>
					{/* 左栏 */}
					{layout.leftCollapsed ? (
						<CollapsedHandle direction="left" onClick={layout.toggleLeft} />
					) : (
						<div
							style={{ width: layout.leftWidth }}
							className="h-full flex-shrink-0 overflow-hidden rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-white/60 dark:border-zinc-700/50"
						>
							<ThreadListSidebar
								threads={threads}
								activeThreadId={activeThreadId}
								activePaperId={selectedPaper?.id ?? null}
								onSelect={setActiveThreadId}
								onCreate={createThread}
								onDelete={deleteThread}
								onRename={updateThreadTitle}
								activeTab={sidebarTab}
								onTabChange={setSidebarTab}
								onPaperSelect={handlePaperSelect}
							/>
						</div>
					)}

					{/* 左分割线 */}
					{!layout.leftCollapsed && <Divider {...layout.leftDividerProps} />}

					{/* 中间面板（tab 切换） */}
					<div className="flex-1 h-full flex flex-col min-w-0 rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-white/60 dark:border-zinc-700/50 overflow-hidden">
						{/* Tab bar */}
						<div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-zinc-200/50 dark:border-zinc-700/50 flex-shrink-0">
							<div className="flex items-center gap-1">
								<button
									type="button"
									onClick={() => setCenterTab("recipe")}
									className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
										centerTab === "recipe"
											? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
											: "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
									}`}
								>
									<ChefHat className="w-3.5 h-3.5" />
									食谱
								</button>
								{selectedPaper && (
									<button
										type="button"
										onClick={() => setCenterTab("paper")}
										className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer max-w-[200px] ${
											centerTab === "paper"
												? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
												: "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
										}`}
									>
										<FileText className="w-3.5 h-3.5 shrink-0" />
										<span className="truncate">{selectedPaper.title}</span>
									</button>
								)}
							</div>

							{/* Language toggle (English papers only) */}
							{centerTab === "paper" && selectedPaper?.lang === "en" && (
								<div className="flex items-center rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
									<button
										type="button"
										onClick={() => setViewLang("zh")}
										className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
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
										className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
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
						</div>

						{/* 内容区 */}
						{centerTab === "recipe" && (
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
						{centerTab === "paper" && selectedPaper && (
							<PaperViewer
								paperId={selectedPaper.id}
								viewLang={selectedPaper.lang === "en" ? viewLang : "original"}
							/>
						)}
					</div>

					{/* 右分割线 */}
					{!layout.rightCollapsed && <Divider {...layout.rightDividerProps} />}

					{/* 右栏 */}
					{layout.rightCollapsed ? (
						<CollapsedHandle direction="right" onClick={layout.toggleRight} />
					) : (
						<div
							style={{ width: layout.rightWidth }}
							className="h-full flex-shrink-0 overflow-hidden rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-white/60 dark:border-zinc-700/50"
						>
							{loading && (
								<div className="h-full flex items-center justify-center">
									<Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
								</div>
							)}
							{!loading && activeThreadId && chatReady && (
								<ErrorBoundary>
									<Chat
										key={activeThreadId}
										threadId={activeThreadId}
										initialMessages={initialMessages}
										onTitleUpdate={handleTitleUpdate}
										recipe={recipe}
										onRecipeUpdate={handleRecipeUpdate}
										onLoadingChange={setIsAiLoading}
										registerImprove={(fn) => {
											improveRef.current = fn;
										}}
									/>
								</ErrorBoundary>
							)}
						</div>
					)}
				</div>
			</Show>
		</main>
	);
}

export default App;

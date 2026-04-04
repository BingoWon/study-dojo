"use client";

import {
	SignedIn,
	SignedOut,
	SignInButton,
	SignUpButton,
	UserButton,
} from "@clerk/nextjs";
import { CopilotKit, useLangGraphInterrupt } from "@copilotkit/react-core";
import {
	CopilotChat,
	CopilotChatConfigurationProvider,
	UseAgentUpdate,
	useAgent,
	useConfigureSuggestions,
	useCopilotKit,
} from "@copilotkit/react-core/v2";
import {
	IconFileTypeDocx,
	IconFileTypeJpg,
	IconFileTypePdf,
	IconFileTypePng,
	IconFileTypeTxt,
} from "@tabler/icons-react";
import { ChefHat, FileText, Globe, Languages, Loader2 } from "lucide-react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { CollapsedHandle } from "@/components/CollapsedHandle";
import { Divider } from "@/components/Divider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SearchCard } from "@/components/PaperSearchToolUI";
import { PaperViewer } from "@/components/PaperViewer";
import {
	INITIAL_RECIPE,
	type Recipe,
	RecipePanel,
} from "@/components/RecipePanel";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
	type SidebarTab,
	ThreadListSidebar,
} from "@/components/ThreadListSidebar";
import { useResizableLayout } from "@/hooks/useResizableLayout";
import { useThreads } from "@/lib/useThreads";

type CenterTab = "recipe" | "paper";

const FILE_TAB_ICONS: Record<string, FC<{ className?: string }>> = {
	pdf: IconFileTypePdf,
	png: IconFileTypePng,
	jpg: IconFileTypeJpg,
	jpeg: IconFileTypeJpg,
	docx: IconFileTypeDocx,
	txt: IconFileTypeTxt,
	md: IconFileTypeTxt,
};

export default function Page() {
	return (
		<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
			<SignedOut>
				<LandingPage />
			</SignedOut>
			<SignedIn>
				<CopilotKit runtimeUrl="/api/copilotkit" agent="roast_prof">
					<CopilotChatConfigurationProvider agentId="roast_prof">
						<MainApp />
					</CopilotChatConfigurationProvider>
				</CopilotKit>
			</SignedIn>
		</ThemeProvider>
	);
}

// ── Landing ─────────────────────────────────────────────────────────────────

function LandingPage() {
	return (
		<main className="h-screen w-screen bg-[#dedee9] dark:bg-[#1a1a2e] text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-8 relative overflow-hidden">
			<header className="absolute top-0 right-0 p-4 z-50">
				<ThemeToggle />
			</header>
			<div
				className="absolute w-[446px] h-[446px] left-[65%] top-[1%] rounded-full z-0"
				style={{ background: "rgba(255,172,77,0.2)", filter: "blur(103px)" }}
			/>
			<div
				className="absolute w-[609px] h-[609px] left-[40%] top-[-30%] rounded-full z-0"
				style={{ background: "#C9C9DA", filter: "blur(103px)" }}
			/>
			<div className="max-w-md w-full space-y-8 animate-in fade-in text-center z-10">
				<div className="w-20 h-20 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm ring-1 ring-blue-500/20">
					<svg
						className="w-10 h-10"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M13 10V3L4 14h7v7l9-11h-7z"
						/>
					</svg>
				</div>
				<h1 className="text-4xl font-bold tracking-tight">AI 食谱助手</h1>
				<p className="text-zinc-500 dark:text-zinc-400 text-lg">
					智能食谱创建器，准备就绪。登录以体验所有功能。
				</p>
				<div className="flex gap-3 justify-center pt-6">
					<SignInButton mode="modal">
						<button
							type="button"
							className="px-8 py-3.5 text-sm font-semibold rounded-full ring-1 ring-zinc-300 dark:ring-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
						>
							立即登录
						</button>
					</SignInButton>
					<SignUpButton mode="modal">
						<button
							type="button"
							className="px-8 py-3.5 text-sm font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-full shadow-lg hover:opacity-90 transition cursor-pointer"
						>
							免费注册
						</button>
					</SignUpButton>
				</div>
			</div>
		</main>
	);
}

// ── Main App ────────────────────────────────────────────────────────────────

interface RecipeAgentState {
	recipe: Recipe;
}

function MainApp() {
	const { agent } = useAgent({
		agentId: "roast_prof",
		updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
	});
	const { copilotkit } = useCopilotKit();
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

	useConfigureSuggestions({
		suggestions: [
			{ title: "意大利面", message: "做一道经典的意大利面食谱" },
			{ title: "中式炒菜", message: "做一道简单的家常炒菜食谱" },
			{ title: "健康沙拉", message: "做一份低卡健康沙拉食谱" },
		],
		available: "always",
	});

	useLangGraphInterrupt({
		render: ({ event, resolve }) => {
			// biome-ignore lint/suspicious/noExplicitAny: interrupt value
			const val = (event as any).value;
			return (
				<SearchCard
					queries={val?.queries ?? []}
					defaultTopK={val?.defaultTopK ?? 5}
					onRespond={resolve}
				/>
			);
		},
	});

	// ── Agent state sync ────────────────────────────────────────────────────
	const agentState = agent.state as RecipeAgentState | undefined;
	const setAgentState = (s: RecipeAgentState) => agent.setState(s);
	const isAiLoading = agent.isRunning;

	useEffect(() => {
		if (!agentState?.recipe) setAgentState({ recipe: INITIAL_RECIPE });
		// biome-ignore lint/correctness/useExhaustiveDependencies: init once
	}, [setAgentState, agentState?.recipe]);

	const [recipe, setRecipe] = useState<Recipe>(INITIAL_RECIPE);
	const [_changedKeys, setChangedKeys] = useState<string[]>([]);
	const changedKeysRef = useRef<string[]>([]);

	// Sync agent → local
	const newRecipe = { ...recipe };
	const newChanged: string[] = [];
	if (agentState?.recipe) {
		for (const key in recipe) {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic key
			let av = (agentState.recipe as any)[key];
			// biome-ignore lint/suspicious/noExplicitAny: dynamic key
			const lv = (recipe as any)[key];
			if (av != null) {
				if (typeof av === "string") av = av.replace(/\\n/g, "\n");
				if (JSON.stringify(av) !== JSON.stringify(lv)) {
					// biome-ignore lint/suspicious/noExplicitAny: dynamic assignment
					(newRecipe as any)[key] = av;
					newChanged.push(key);
				}
			}
		}
	}
	if (newChanged.length > 0) changedKeysRef.current = newChanged;
	else if (!isAiLoading) changedKeysRef.current = [];

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on state
	useEffect(() => {
		setRecipe(newRecipe);
	}, [JSON.stringify(newRecipe)]);

	const handleRecipeUpdate = useCallback(
		(partial: Partial<Recipe>) => {
			const next = { ...recipe, ...partial };
			setAgentState({
				...(agentState || { recipe: INITIAL_RECIPE }),
				recipe: next,
			});
			setRecipe(next);
			setChangedKeys(Object.keys(partial));
			setTimeout(() => setChangedKeys([]), 2000);
		},
		[recipe, agentState, setAgentState],
	);

	// ── Layout state ────────────────────────────────────────────────────────
	const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
	const [centerTab, setCenterTab] = useState<CenterTab>("recipe");
	const [selectedPaper, setSelectedPaper] = useState<{
		id: string;
		title: string;
		lang?: string | null;
		fileExt?: string | null;
	} | null>(null);
	const [viewLang, setViewLang] = useState<"original" | "zh">("zh");
	const containerRef = useRef<HTMLDivElement>(null);
	const layout = useResizableLayout(containerRef);

	const _handleTitleUpdate = useCallback(
		(title: string) => {
			if (activeThreadId) setThreadTitle(activeThreadId, title);
		},
		[activeThreadId, setThreadTitle],
	);

	const handlePaperSelect = useCallback(
		(
			paperId: string,
			title: string,
			lang?: string | null,
			fileExt?: string | null,
		) => {
			setSelectedPaper({ id: paperId, title, lang, fileExt });
			setViewLang(lang === "en" ? "zh" : "original");
			setCenterTab("paper");
		},
		[],
	);

	const handleImprove = useCallback(() => {
		if (!isAiLoading) {
			agent.addMessage({
				id: crypto.randomUUID(),
				role: "user",
				content: "优化这个食谱，让它更好",
			});
			copilotkit.runAgent({ agent });
		}
	}, [isAiLoading, agent, copilotkit]);

	return (
		<main className="h-screen w-screen bg-[#dedee9] dark:bg-[#1a1a2e] text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30 flex transition-colors duration-300 relative">
			{/* Background blurs */}
			<div
				className="absolute w-[446px] h-[446px] left-[65%] top-[1%] rounded-full z-0"
				style={{ background: "rgba(255,172,77,0.2)", filter: "blur(103px)" }}
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
				style={{ background: "rgba(255,243,136,0.3)", filter: "blur(103px)" }}
			/>

			<header className="absolute top-0 right-0 p-4 z-50 flex items-center gap-3">
				<ThemeToggle />
				<UserButton />
			</header>

			<div
				ref={containerRef}
				className={`flex-1 flex h-full overflow-hidden pt-2 pb-2 gap-1.5 z-10 ${layout.leftCollapsed ? "pl-0" : "pl-2"} ${layout.rightCollapsed ? "pr-0" : "pr-2"}`}
			>
				{/* Left: Sidebar */}
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

				{!layout.leftCollapsed && <Divider {...layout.leftDividerProps} />}

				{/* Center: Recipe / Paper */}
				<div className="flex-1 h-full flex flex-col min-w-0 rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-white/60 dark:border-zinc-700/50 overflow-hidden">
					<div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-zinc-200/50 dark:border-zinc-700/50 flex-shrink-0">
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => setCenterTab("recipe")}
								className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${centerTab === "recipe" ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
							>
								<ChefHat className="w-3.5 h-3.5" />
								食谱
							</button>
							{selectedPaper && (
								<button
									type="button"
									onClick={() => setCenterTab("paper")}
									className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer max-w-[200px] ${centerTab === "paper" ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
								>
									{(() => {
										const Icon =
											FILE_TAB_ICONS[selectedPaper.fileExt ?? ""] ?? FileText;
										return <Icon className="w-3.5 h-3.5 shrink-0" />;
									})()}
									<span className="truncate">{selectedPaper.title}</span>
								</button>
							)}
						</div>
						{centerTab === "paper" && selectedPaper?.lang === "en" && (
							<div className="flex items-center rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
								<button
									type="button"
									onClick={() => setViewLang("zh")}
									className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${viewLang === "zh" ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" : "text-zinc-500"}`}
								>
									<Languages className="w-3 h-3" />
									中文翻译
								</button>
								<button
									type="button"
									onClick={() => setViewLang("original")}
									className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${viewLang === "original" ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" : "text-zinc-500"}`}
								>
									<Globe className="w-3 h-3" />
									英文原文
								</button>
							</div>
						)}
					</div>
					{centerTab === "recipe" && (
						<div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-4">
							<RecipePanel
								recipe={recipe}
								onUpdate={handleRecipeUpdate}
								isLoading={isAiLoading}
								changedKeys={changedKeysRef.current}
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

				{!layout.rightCollapsed && <Divider {...layout.rightDividerProps} />}

				{/* Right: CopilotKit Chat */}
				{layout.rightCollapsed ? (
					<CollapsedHandle direction="right" onClick={layout.toggleRight} />
				) : (
					<div
						style={{ width: layout.rightWidth }}
						className="h-full flex-shrink-0 overflow-hidden rounded-2xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-white/60 dark:border-zinc-700/50"
					>
						{loading ? (
							<div className="h-full flex items-center justify-center">
								<Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
							</div>
						) : (
							<ErrorBoundary>
								<CopilotChat
									agentId="roast_prof"
									className="copilot-chat-fill"
								/>
							</ErrorBoundary>
						)}
					</div>
				)}
			</div>
		</main>
	);
}

"use client";

import {
	useAgent,
	UseAgentUpdate,
	useCopilotKit,
	useConfigureSuggestions,
	CopilotSidebar,
	CopilotChatConfigurationProvider,
} from "@copilotkit/react-core/v2";
import { CopilotKit, useLangGraphInterrupt } from "@copilotkit/react-core";
import {
	SignInButton,
	SignUpButton,
	UserButton,
	SignedIn,
	SignedOut,
} from "@clerk/nextjs";
import { useEffect, useRef, useState, useCallback } from "react";
import { SearchCard } from "@/components/PaperSearchToolUI";
import { RecipePanel, INITIAL_RECIPE, type Recipe } from "@/components/RecipePanel";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Page() {
	return (
		<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
			<SignedOut>
				<LandingPage />
			</SignedOut>
			<SignedIn>
				<CopilotKit
					runtimeUrl="/api/copilotkit"
					agent="roast_prof"
				>
					<CopilotChatConfigurationProvider agentId="roast_prof">
						<MainApp />
					</CopilotChatConfigurationProvider>
				</CopilotKit>
			</SignedIn>
		</ThemeProvider>
	);
}

// ── Landing Page ──────────────────────────────────────────────────────────────

function LandingPage() {
	return (
		<main className="h-screen w-screen bg-[#dedee9] dark:bg-[#1a1a2e] text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-8 relative">
			<div className="absolute top-4 right-4 z-50">
				<ThemeToggle />
			</div>
			<div className="max-w-md w-full space-y-8 animate-in fade-in text-center">
				<div className="text-6xl mb-4">🍳</div>
				<h1 className="text-4xl font-bold tracking-tight">Roast Prof</h1>
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

// ── Main App ──────────────────────────────────────────────────────────────────

interface RecipeAgentState {
	recipe: Recipe;
}

function MainApp() {
	const { agent } = useAgent({
		agentId: "roast_prof",
		updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
	});
	const { copilotkit } = useCopilotKit();

	useConfigureSuggestions({
		suggestions: [
			{ title: "创建意大利面", message: "做一道经典的意大利面食谱" },
			{ title: "中式炒菜", message: "做一道简单的家常炒菜食谱" },
			{ title: "健康沙拉", message: "做一份低卡健康沙拉食谱" },
		],
		available: "always",
	});

	// HITL: LangGraph interrupt for RAG search
	useLangGraphInterrupt({
		render: ({ event, resolve }) => {
			// biome-ignore lint/suspicious/noExplicitAny: interrupt event shape
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

	const agentState = agent.state as RecipeAgentState | undefined;
	const setAgentState = (s: RecipeAgentState) => agent.setState(s);
	const isLoading = agent.isRunning;

	// Initialize agent state on mount
	useEffect(() => {
		if (!agentState?.recipe) {
			setAgentState({ recipe: INITIAL_RECIPE });
		}
	// biome-ignore lint/correctness/useExhaustiveDependencies: init once
	}, []);

	// Local recipe state synced with agent
	const [recipe, setRecipe] = useState<Recipe>(INITIAL_RECIPE);
	const changedKeysRef = useRef<string[]>([]);

	// Sync agent state → local recipe
	const newRecipe = { ...recipe };
	const newChanged: string[] = [];
	if (agentState?.recipe) {
		for (const key in recipe) {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic key access
			let agentVal = (agentState.recipe as any)[key];
			// biome-ignore lint/suspicious/noExplicitAny: dynamic key access
			const localVal = (recipe as any)[key];
			if (agentVal != null) {
				if (typeof agentVal === "string") agentVal = agentVal.replace(/\\n/g, "\n");
				if (JSON.stringify(agentVal) !== JSON.stringify(localVal)) {
					// biome-ignore lint/suspicious/noExplicitAny: dynamic assignment
					(newRecipe as any)[key] = agentVal;
					newChanged.push(key);
				}
			}
		}
	}
	if (newChanged.length > 0) changedKeysRef.current = newChanged;
	else if (!isLoading) changedKeysRef.current = [];

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on serialized state
	useEffect(() => {
		setRecipe(newRecipe);
	}, [JSON.stringify(newRecipe)]);

	const updateRecipe = useCallback(
		(partial: Partial<Recipe>) => {
			const next = { ...recipe, ...partial };
			setAgentState({ ...(agentState || { recipe: INITIAL_RECIPE }), recipe: next });
			setRecipe(next);
		},
		[recipe, agentState, setAgentState],
	);

	return (
		<main className="h-screen w-screen bg-[#dedee9] dark:bg-[#1a1a2e] text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans relative">
			{/* Background blurs */}
			<div className="absolute w-[446px] h-[446px] left-[65%] top-[1%] rounded-full z-0" style={{ background: "rgba(255, 172, 77, 0.2)", filter: "blur(103px)" }} />
			<div className="absolute w-[609px] h-[609px] left-[40%] top-[-30%] rounded-full z-0" style={{ background: "#C9C9DA", filter: "blur(103px)" }} />
			<div className="absolute w-[609px] h-[609px] left-[30%] top-[70%] rounded-full z-0" style={{ background: "#F3F3FC", filter: "blur(103px)" }} />
			<div className="absolute w-[446px] h-[446px] left-[8%] top-[30%] rounded-full z-0" style={{ background: "rgba(255, 243, 136, 0.3)", filter: "blur(103px)" }} />

			{/* Header */}
			<header className="absolute top-0 right-0 p-4 z-50 flex items-center gap-3">
				<ThemeToggle />
				<UserButton />
			</header>

			{/* Content */}
			<div className="flex items-center justify-center w-full h-full z-10 relative">
				<div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-4">
					<RecipePanel
						recipe={recipe}
						onUpdate={updateRecipe}
						isLoading={isLoading}
						changedKeys={changedKeysRef.current}
						onImprove={() => {
							if (!isLoading) {
								agent.addMessage({
									id: crypto.randomUUID(),
									role: "user",
									content: "优化这个食谱，让它更好",
								});
								copilotkit.runAgent({ agent });
							}
						}}
					/>
				</div>

				<CopilotSidebar
					agentId="roast_prof"
					defaultOpen={true}
					labels={{ modalHeaderTitle: "AI 食谱助手" }}
				/>
			</div>
		</main>
	);
}

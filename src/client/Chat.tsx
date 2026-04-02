import { type UIMessage as Message, useChat } from "@ai-sdk/react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import {
	ActionBarPrimitive,
	AssistantRuntimeProvider,
	BranchPickerPrimitive,
	ComposerPrimitive,
	MessagePrimitive,
	ThreadPrimitive,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { DefaultChatTransport } from "ai";
import {
	Bot,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Copy,
	RefreshCw,
	Send,
	Trash2,
} from "lucide-react";
import { type FC, useEffect, useMemo, useRef } from "react";
import { ReasoningPart } from "./components/message/ReasoningPart";
import { TextPart } from "./components/message/TextPart";
import type { Recipe } from "./components/RecipePanel";
import { SearchToolUI } from "./components/tools/SearchToolUI";
import { ToolCallFallback } from "./components/tools/ToolCallFallback";
import { WeatherToolUI } from "./components/tools/WeatherToolUI";

// ── Branch Picker ─────────────────────────────────────────────────────────────

const AssistantBranchPicker: FC = () => (
	<BranchPickerPrimitive.Root className="flex items-center gap-1 text-zinc-500">
		<BranchPickerPrimitive.Previous className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-20 transition-all">
			<ChevronLeft className="h-3 w-3" />
		</BranchPickerPrimitive.Previous>
		<span className="text-[10px] tabular-nums">
			<BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
		</span>
		<BranchPickerPrimitive.Next className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-20 transition-all">
			<ChevronRight className="h-3 w-3" />
		</BranchPickerPrimitive.Next>
	</BranchPickerPrimitive.Root>
);

// ── Action Bar ────────────────────────────────────────────────────────────────

const AssistantActionBar: FC = () => (
	<ActionBarPrimitive.Root
		hideWhenRunning
		autohide="not-last"
		className="flex items-center gap-1 mt-2 px-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150"
	>
		<ActionBarPrimitive.Copy asChild>
			<button
				type="button"
				className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-all"
				title="复制"
			>
				<Copy className="h-3 w-3" />
			</button>
		</ActionBarPrimitive.Copy>
		<ActionBarPrimitive.Reload asChild>
			<button
				type="button"
				className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-all"
				title="重新生成"
			>
				<RefreshCw className="h-3 w-3" />
			</button>
		</ActionBarPrimitive.Reload>
		<AssistantBranchPicker />
	</ActionBarPrimitive.Root>
);

// ── Message Components ────────────────────────────────────────────────────────

const UserMessage: FC = () => (
	<MessagePrimitive.Root className="ml-auto flex max-w-[85%] flex-col items-end mb-6 group">
		<div className="relative rounded-3xl rounded-tr-sm bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 px-6 py-4 text-zinc-900 dark:text-zinc-100 shadow-xl dark:shadow-2xl border border-zinc-300/50 dark:border-white/5 backdrop-blur-xl">
			<div className="leading-relaxed whitespace-pre-wrap text-sm flex flex-col gap-2">
				<MessagePrimitive.Parts />
			</div>
		</div>
		<ActionBarPrimitive.Root
			hideWhenRunning
			autohide="not-last"
			className="flex items-center gap-1 mt-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
		>
			<ActionBarPrimitive.Edit asChild>
				<button
					type="button"
					className="inline-flex items-center gap-1 px-2 h-6 rounded text-[10px] text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300 transition-all cursor-pointer"
				>
					编辑
				</button>
			</ActionBarPrimitive.Edit>
		</ActionBarPrimitive.Root>
	</MessagePrimitive.Root>
);

const AssistantMessage: FC = () => (
	<MessagePrimitive.Root className="mr-auto flex max-w-[85%] flex-col items-start mb-6 group">
		<div className="flex items-center gap-2 mb-2">
			<div className="relative h-6 w-6 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shadow-md dark:shadow-lg">
				<Bot className="w-3.5 h-3.5" />
				<MessagePrimitive.If last>
					<ThreadPrimitive.If running>
						<span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
							<span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
						</span>
					</ThreadPrimitive.If>
				</MessagePrimitive.If>
			</div>
			<span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 tracking-wider">
				AI 助手
			</span>
		</div>

		<div className="w-full flex flex-col">
			<MessagePrimitive.Parts
				components={{
					Text: TextPart,
					Reasoning: ReasoningPart,
					tools: {
						Fallback: ToolCallFallback,
						by_name: {
							get_weather: WeatherToolUI,
							search_web: SearchToolUI,
							update_recipe: RecipeToolUI,
						},
					},
				}}
			/>
		</div>

		<AssistantActionBar />
	</MessagePrimitive.Root>
);

// ── Recipe Tool UI ────────────────────────────────────────────────────────────

let _recipeUpdateCallback: ((data: Partial<Recipe>) => void) | null = null;

export function setRecipeUpdateCallback(
	cb: ((data: Partial<Recipe>) => void) | null,
) {
	_recipeUpdateCallback = cb;
}

const RecipeToolUI: FC<ToolCallMessagePartProps> = ({ result, isError }) => {
	const appliedRef = useRef(false);

	useEffect(() => {
		if (result && !isError && !appliedRef.current) {
			appliedRef.current = true;
			const data = result as Partial<Recipe>;
			_recipeUpdateCallback?.(data);
		}
	}, [result, isError]);

	if (isError)
		return <div className="mb-2 text-xs text-red-500">食谱更新失败</div>;
	if (!result) {
		return (
			<div className="mb-2 flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
				<span className="animate-spin">🍳</span> 正在更新食谱...
			</div>
		);
	}
	return (
		<div className="mb-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
			<Check className="w-3.5 h-3.5" /> 食谱已更新
		</div>
	);
};

// ── Empty State (Recipe-specific) ─────────────────────────────────────────────

const RecipeEmptyState: FC<{ onSend: (text: string) => void }> = ({
	onSend,
}) => (
	<div className="flex flex-col items-center justify-center h-full text-center px-4 select-none">
		<div className="text-4xl mb-4">🍳</div>
		<h2 className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mb-2">
			AI 食谱助手
		</h2>
		<p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6 max-w-xs">
			告诉我你想做什么菜，或者点击下方快速开始
		</p>
		<div className="flex flex-col gap-2 w-full max-w-xs">
			{[
				{ label: "意大利面", prompt: "做一道经典的意大利面" },
				{ label: "中式炒菜", prompt: "做一道简单的家常炒菜" },
				{ label: "健康沙拉", prompt: "做一份低卡健康沙拉" },
			].map((item) => (
				<button
					key={item.label}
					type="button"
					onClick={() => onSend(item.prompt)}
					className="text-left px-4 py-3 rounded-xl bg-white/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-sm text-zinc-700 dark:text-zinc-300"
				>
					🍽️ {item.label}
				</button>
			))}
		</div>
	</div>
);

// ── Main Chat ─────────────────────────────────────────────────────────────────

export function Chat({
	threadId,
	initialMessages,
	onTitleUpdate,
	recipe,
	onRecipeUpdate,
	onLoadingChange,
	registerImprove,
}: {
	threadId: string;
	initialMessages: Message[];
	onTitleUpdate?: (title: string) => void;
	recipe: Recipe;
	onRecipeUpdate: (partial: Partial<Recipe>) => void;
	onLoadingChange?: (loading: boolean) => void;
	registerImprove?: (fn: () => void) => void;
}) {
	const titleBuf = useRef("");
	const onTitleRef = useRef(onTitleUpdate);
	onTitleRef.current = onTitleUpdate;

	useEffect(() => {
		setRecipeUpdateCallback(onRecipeUpdate);
		return () => setRecipeUpdateCallback(null);
	}, [onRecipeUpdate]);

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				headers: { "x-thread-id": threadId },
			}),
		[threadId],
	);

	const chat = useChat({
		id: threadId,
		transport,
		messages: initialMessages,
		onData: (part) => {
			const p = part as { type: string; data?: unknown };
			if (p.type === "data-title-delta" && typeof p.data === "string") {
				titleBuf.current += p.data;
				onTitleRef.current?.(titleBuf.current);
			}
		},
	});

	useEffect(() => {
		onLoadingChange?.(
			chat.status === "streaming" || chat.status === "submitted",
		);
	}, [chat.status, onLoadingChange]);

	const runtime = useAISDKRuntime(chat);

	useEffect(() => {
		if (registerImprove) {
			registerImprove(() => {
				const recipeCtx = `当前食谱状态：${JSON.stringify(recipe)}`;
				runtime.thread.append({
					role: "user",
					content: [
						{ type: "text", text: `请优化这个食谱，让它更好。${recipeCtx}` },
					],
				});
			});
		}
	}, [registerImprove, recipe, runtime]);

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			<div className="flex h-full w-full flex-col relative overflow-hidden font-sans">
				<ThreadPrimitive.Root className="flex flex-col h-full w-full relative z-10">
					<ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-3 py-6 scroll-smooth">
						<ThreadPrimitive.Empty>
							<RecipeEmptyState
								onSend={(text) =>
									runtime.thread.append({
										role: "user",
										content: [{ type: "text", text }],
									})
								}
							/>
						</ThreadPrimitive.Empty>

						<ThreadPrimitive.Messages
							components={{ UserMessage, AssistantMessage }}
						/>

						<ThreadPrimitive.ScrollToBottom className="fixed bottom-36 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 shadow-lg transition-all opacity-0 data-[visible]:opacity-100 z-20 cursor-pointer">
							<ChevronDown className="h-4 w-4" />
						</ThreadPrimitive.ScrollToBottom>
					</ThreadPrimitive.Viewport>

					<ThreadPrimitive.ViewportFooter className="pb-4 pt-3 px-3 sticky bottom-0 bg-gradient-to-t from-zinc-50 via-zinc-50/95 dark:from-zinc-950 dark:via-zinc-950/95 to-transparent backdrop-blur-sm z-30">
						<ComposerPrimitive.Root className="flex w-full flex-col gap-2 rounded-2xl bg-white/80 dark:bg-zinc-900/60 p-2 shadow-lg dark:shadow-xl border border-zinc-200 dark:border-zinc-800 backdrop-blur-xl transition-all focus-within:border-blue-500/30 focus-within:ring-2 focus-within:ring-blue-500/8">
							<div className="flex items-end gap-2">
								<ComposerPrimitive.Input
									placeholder="输入消息..."
									rows={1}
									className="flex-1 max-h-28 resize-none bg-transparent px-2 py-2.5 outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 text-sm leading-relaxed"
								/>
								<div className="flex items-center gap-1 mb-0.5">
									<ComposerPrimitive.Cancel className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-500 active:scale-95 cursor-pointer">
										<Trash2 className="h-3.5 w-3.5" />
									</ComposerPrimitive.Cancel>
									<ComposerPrimitive.Send asChild>
										<button
											type="submit"
											className="flex h-8 w-10 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-40 cursor-pointer"
										>
											<Send className="h-3.5 w-3.5 ml-0.5" />
										</button>
									</ComposerPrimitive.Send>
								</div>
							</div>
						</ComposerPrimitive.Root>
					</ThreadPrimitive.ViewportFooter>
				</ThreadPrimitive.Root>
			</div>
		</AssistantRuntimeProvider>
	);
}

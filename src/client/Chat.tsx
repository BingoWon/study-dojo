import { type UIMessage as Message, useChat } from "@ai-sdk/react";
import type {
	AttachmentAdapter,
	ToolCallMessagePartProps,
} from "@assistant-ui/react";
import {
	ActionBarPrimitive,
	AssistantRuntimeProvider,
	AttachmentPrimitive,
	BranchPickerPrimitive,
	ComposerPrimitive,
	MessagePrimitive,
	ThreadPrimitive,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import {
	AlertCircle,
	Bot,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Copy,
	Paperclip,
	RefreshCw,
	Send,
	Trash2,
	X,
} from "lucide-react";
import {
	createContext,
	type FC,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ReasoningPart } from "./components/message/ReasoningPart";
import { TextPart } from "./components/message/TextPart";
import type { Recipe } from "./components/RecipePanel";
import {
	PaperSearchToolUI,
	SuggestSearchToolUI,
} from "./components/tools/PaperSearchToolUI";
import { SearchToolUI } from "./components/tools/SearchToolUI";
import { ToolCallFallback } from "./components/tools/ToolCallFallback";
import { WeatherToolUI } from "./components/tools/WeatherToolUI";

// ── Attachment Adapter ───────────────────────────────────────────────────────
// Universal adapter that handles all file types:
//   - Images → ImageMessagePart (data URL)
//   - Text   → TextMessagePart  (inline content, no XML wrapper)
//   - Others → FileMessagePart  (data URL — PDFs, audio, video)

const readAsDataURL = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result as string);
		r.onerror = reject;
		r.readAsDataURL(file);
	});

const attachmentAdapter: AttachmentAdapter = {
	accept: "image/*,application/pdf,video/*,audio/*",
	async add({ file }) {
		const isImage = file.type.startsWith("image/");
		return {
			id: file.name,
			type: isImage ? "image" : "document",
			name: file.name,
			contentType: file.type,
			file,
			status: { type: "requires-action", reason: "composer-send" },
		};
	},
	async send(attachment) {
		const { file } = attachment;
		const url = await readAsDataURL(file);
		if (file.type.startsWith("image/")) {
			return {
				...attachment,
				status: { type: "complete" },
				content: [{ type: "image", image: url }],
			};
		}
		return {
			...attachment,
			status: { type: "complete" },
			content: [{ type: "file", data: url, mimeType: file.type }],
		};
	},
	async remove() {},
};

// ── Recipe Update Context ────────────────────────────────────────────────────

type AddToolResultFn = (opts: {
	tool: string;
	toolCallId: string;
	// biome-ignore lint/suspicious/noExplicitAny: tool output varies per tool
	output: any;
}) => void;
export const AddToolResultCtx = createContext<AddToolResultFn | null>(null);

const RecipeUpdateCtx = createContext<((data: Partial<Recipe>) => void) | null>(
	null,
);

// ── Attachment Components ────────────────────────────────────────────────────

const UserAttachment: FC = () => (
	<AttachmentPrimitive.Root className="group relative flex items-center gap-2 rounded-xl bg-black/5 dark:bg-white/5 px-3 py-2 border border-zinc-200/50 dark:border-white/5">
		<AttachmentPrimitive.unstable_Thumb className="h-9 w-9 shrink-0 rounded-lg bg-zinc-200 dark:bg-white/10 object-cover" />
		<span className="truncate text-xs text-zinc-600 dark:text-white/70 max-w-[120px]">
			<AttachmentPrimitive.Name />
		</span>
	</AttachmentPrimitive.Root>
);

const ComposerAttachment: FC = () => (
	<AttachmentPrimitive.Root className="group relative flex items-center gap-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2 border border-zinc-200 dark:border-zinc-700">
		<AttachmentPrimitive.unstable_Thumb className="h-10 w-10 shrink-0 rounded-lg bg-zinc-200 dark:bg-zinc-900 object-cover" />
		<span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300 max-w-[120px]">
			<AttachmentPrimitive.Name />
		</span>
		<AttachmentPrimitive.Remove className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-400 dark:bg-zinc-600 text-white shadow transition-transform hover:scale-110 active:scale-95 cursor-pointer">
			<X className="w-3 h-3" />
		</AttachmentPrimitive.Remove>
	</AttachmentPrimitive.Root>
);

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
		<MessagePrimitive.If last>
			<ActionBarPrimitive.Reload asChild>
				<button
					type="button"
					className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-all"
					title="重新生成"
				>
					<RefreshCw className="h-3 w-3" />
				</button>
			</ActionBarPrimitive.Reload>
		</MessagePrimitive.If>
		<AssistantBranchPicker />
	</ActionBarPrimitive.Root>
);

// ── Message Components ────────────────────────────────────────────────────────

const UserMessage: FC = () => (
	<MessagePrimitive.Root className="ml-auto flex max-w-[85%] flex-col items-end mb-6 group">
		<div className="relative rounded-3xl rounded-tr-sm bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 px-6 py-4 text-zinc-900 dark:text-zinc-100 shadow-xl dark:shadow-2xl border border-zinc-300/50 dark:border-white/5 backdrop-blur-xl">
			<div className="mb-2 flex flex-wrap gap-2 empty:hidden">
				<MessagePrimitive.Attachments
					components={{ Attachment: UserAttachment }}
				/>
			</div>
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
							rag_suggest: SuggestSearchToolUI,
							rag_search: PaperSearchToolUI,
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

const RecipeToolUI: FC<ToolCallMessagePartProps> = ({ result, isError }) => {
	const onRecipeUpdate = useContext(RecipeUpdateCtx);
	const appliedRef = useRef(false);

	useEffect(() => {
		if (result && !isError && !appliedRef.current) {
			appliedRef.current = true;
			onRecipeUpdate?.(result as Partial<Recipe>);
		}
	}, [result, isError, onRecipeUpdate]);

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

// ── Error Banner ─────────────────────────────────────────────────────────────

function parseErrorMessage(error: Error): string {
	const msg = error.message || "";
	if (msg.includes("API key")) return "API 密钥无效或未配置";
	if (msg.includes("rate limit") || msg.includes("429"))
		return "请求过于频繁，请稍后再试";
	if (msg.includes("timeout") || msg.includes("ETIMEDOUT"))
		return "请求超时，请检查网络连接";
	if (msg.includes("fetch failed") || msg.includes("NetworkError"))
		return "网络连接失败";
	if (msg.includes("500")) return "服务器内部错误";
	return msg.length > 100 ? `${msg.slice(0, 100)}…` : msg || "未知错误";
}

const ErrorBanner: FC<{ error: Error; onDismiss: () => void }> = ({
	error,
	onDismiss,
}) => (
	<div className="mx-3 mb-2 flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-4 py-3 text-sm animate-in slide-in-from-top-2 duration-200">
		<AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
		<span className="flex-1 text-red-700 dark:text-red-300">
			{parseErrorMessage(error)}
		</span>
		<button
			type="button"
			onClick={onDismiss}
			className="shrink-0 rounded-lg p-1 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors cursor-pointer"
		>
			<X className="h-3.5 w-3.5" />
		</button>
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
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		onData: (part) => {
			const p = part as { type: string; data?: unknown };
			if (p.type === "data-title-delta" && typeof p.data === "string") {
				titleBuf.current += p.data;
				onTitleRef.current?.(titleBuf.current);
			}
		},
	});

	// ── Error tracking ───────────────────────────────────────────────────
	const [visibleError, setVisibleError] = useState<Error | null>(null);
	useEffect(() => {
		if (chat.error) setVisibleError(chat.error);
	}, [chat.error]);

	useEffect(() => {
		onLoadingChange?.(
			chat.status === "streaming" || chat.status === "submitted",
		);
	}, [chat.status, onLoadingChange]);

	const runtime = useAISDKRuntime(chat, {
		adapters: { attachments: attachmentAdapter },
	});

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
		<AddToolResultCtx value={chat.addToolResult}>
			<RecipeUpdateCtx value={onRecipeUpdate}>
				<AssistantRuntimeProvider runtime={runtime}>
					<div className="flex h-full w-full flex-col relative overflow-hidden font-sans">
						<ThreadPrimitive.Root className="flex flex-col h-full w-full relative z-10">
							<ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-3 pt-14 pb-6 scroll-smooth">
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

							<ThreadPrimitive.ViewportFooter className="pb-4 pt-3 sticky bottom-0 bg-gradient-to-t from-white/50 via-white/40 dark:from-zinc-900/50 dark:via-zinc-900/40 to-transparent backdrop-blur-sm z-30">
								{visibleError && (
									<ErrorBanner
										error={visibleError}
										onDismiss={() => setVisibleError(null)}
									/>
								)}
								<ComposerPrimitive.Root className="mx-3 flex w-auto flex-col rounded-2xl bg-white/70 dark:bg-zinc-800/70 p-2 shadow-sm border border-white/60 dark:border-zinc-700/50 backdrop-blur-xl transition-all focus-within:border-blue-400/40 focus-within:ring-2 focus-within:ring-blue-400/10">
									<div className="flex flex-wrap gap-2 px-1 pt-1 pb-0 empty:hidden">
										<ComposerPrimitive.Attachments
											components={{ Attachment: ComposerAttachment }}
										/>
									</div>
									<div className="flex items-end gap-1">
										<ComposerPrimitive.AddAttachment
											className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 dark:text-zinc-500 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 active:scale-95 cursor-pointer"
											title="添加附件"
										>
											<Paperclip className="h-4 w-4" />
										</ComposerPrimitive.AddAttachment>
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
			</RecipeUpdateCtx>
		</AddToolResultCtx>
	);
}

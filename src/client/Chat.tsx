import { type UIMessage as Message, useChat } from "@ai-sdk/react";
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
	Bot,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Copy,
	Paperclip,
	RefreshCw,
	Send,
	Trash2,
	User,
	X,
} from "lucide-react";
import { type FC, useEffect, useRef } from "react";
import { EmptyState } from "./components/EmptyState";
import { ReasoningPart } from "./components/message/ReasoningPart";
import { TextPart } from "./components/message/TextPart";
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

// ── Attachment Components ─────────────────────────────────────────────────────

const UserAttachment: FC = () => (
	<AttachmentPrimitive.Root className="group relative flex h-14 w-40 items-center justify-between rounded-xl bg-black/5 dark:bg-black/10 px-3 py-2 backdrop-blur-md border border-zinc-200 dark:border-white/5 transition-all hover:bg-black/10 dark:hover:bg-black/20">
		<div className="flex items-center gap-2 overflow-hidden">
			<AttachmentPrimitive.unstable_Thumb className="h-10 w-10 shrink-0 rounded-lg bg-black/5 dark:bg-white/10 object-cover" />
			<span className="truncate text-xs font-medium text-zinc-700 dark:text-white/80">
				<AttachmentPrimitive.Name />
			</span>
		</div>
	</AttachmentPrimitive.Root>
);

const ComposerAttachment: FC = () => (
	<AttachmentPrimitive.Root className="group relative flex h-16 w-48 items-center justify-between rounded-2xl bg-white dark:bg-zinc-800/80 px-3 py-2 shadow-sm dark:shadow-inner border border-zinc-200 dark:border-white/5">
		<div className="flex items-center gap-3 overflow-hidden">
			<AttachmentPrimitive.unstable_Thumb className="h-12 w-12 shrink-0 rounded-xl bg-zinc-100 dark:bg-zinc-900 object-cover shadow-sm" />
			<span className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-300">
				<AttachmentPrimitive.Name />
			</span>
		</div>
		<AttachmentPrimitive.Remove className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-transform hover:scale-110 active:scale-95">
			<X className="w-3.5 h-3.5" />
		</AttachmentPrimitive.Remove>
	</AttachmentPrimitive.Root>
);

// ── Message Components ────────────────────────────────────────────────────────

const UserMessage: FC = () => (
	<MessagePrimitive.Root className="ml-auto flex max-w-[85%] flex-col items-end mb-6 group">
		<div className="flex items-center gap-2 mb-2">
			<span className="text-xs font-medium text-zinc-500">你</span>
			<div className="h-6 w-6 rounded-full bg-gradient-to-tr from-orange-400 to-amber-600 flex items-center justify-center text-white shadow-md dark:shadow-lg">
				<User className="w-3.5 h-3.5" />
			</div>
		</div>
		<div className="relative rounded-3xl rounded-tr-sm bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 px-6 py-4 text-zinc-900 dark:text-zinc-100 shadow-xl dark:shadow-2xl border border-zinc-300/50 dark:border-white/5 backdrop-blur-xl">
			<div className="mb-3 flex flex-wrap gap-2 empty:hidden">
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
						},
					},
				}}
			/>
		</div>

		<AssistantActionBar />
	</MessagePrimitive.Root>
);

// ── Main Chat ─────────────────────────────────────────────────────────────────

export function Chat({
	threadId,
	initialMessages,
	onTitleGenerated,
}: {
	threadId: string;
	initialMessages: Message[];
	onTitleGenerated?: (title: string) => void;
}) {
	const chat = useChat({
		api: "/api/chat",
		id: threadId,
		initialMessages,
		maxSteps: 5,
		body: { threadId },
	} as any);

	// Auto-generate title from first user message (new threads only)
	const titleDone = useRef(initialMessages.length > 0);
	useEffect(() => {
		if (titleDone.current || !onTitleGenerated) return;
		const firstUser = chat.messages.find((m) => m.role === "user");
		if (!firstUser) return;
		let text = "";
		const tp = firstUser.parts.find((p) => p.type === "text");
		if (tp && "text" in tp) text = tp.text;
		if (text) {
			onTitleGenerated(text.slice(0, 20) + (text.length > 20 ? "..." : ""));
			titleDone.current = true;
		}
	}, [chat.messages, onTitleGenerated]);

	const runtime = useAISDKRuntime(chat);

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			<div className="flex h-full w-full flex-col relative overflow-hidden font-sans">
				<div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

				<ThreadPrimitive.Root className="flex flex-col h-full w-full max-w-3xl mx-auto relative z-10">
					<ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 md:px-6 py-8 scroll-smooth">
						<ThreadPrimitive.Empty>
							<EmptyState
								onPredefinedClick={(text) =>
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

						<ThreadPrimitive.ScrollToBottom className="fixed bottom-36 right-1/2 translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 shadow-lg transition-all opacity-0 data-[visible]:opacity-100 z-20 cursor-pointer">
							<ChevronDown className="h-4 w-4" />
						</ThreadPrimitive.ScrollToBottom>
					</ThreadPrimitive.Viewport>

					<ThreadPrimitive.ViewportFooter className="pb-8 pt-4 px-4 md:px-6 sticky bottom-0 bg-gradient-to-t from-zinc-50 via-zinc-50/95 dark:from-zinc-950 dark:via-zinc-950/95 to-transparent backdrop-blur-sm z-30">
						<ComposerPrimitive.Root className="flex w-full flex-col gap-3 rounded-3xl bg-white/80 dark:bg-zinc-900/60 p-3 shadow-xl dark:shadow-2xl border border-zinc-200 dark:border-zinc-800 backdrop-blur-2xl transition-all focus-within:border-blue-500/30 focus-within:bg-white dark:focus-within:bg-zinc-900/80 focus-within:ring-4 focus-within:ring-blue-500/8">
							<div className="flex flex-wrap gap-3 px-2 pt-2 empty:hidden">
								<ComposerPrimitive.Attachments
									components={{ Attachment: ComposerAttachment }}
								/>
							</div>
							<div className="flex items-end gap-2">
								<ComposerPrimitive.AddAttachment
									className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-400 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 active:scale-95 cursor-pointer"
									title="上传文件"
								>
									<Paperclip className="h-5 w-5" />
								</ComposerPrimitive.AddAttachment>

								<ComposerPrimitive.Input
									placeholder="输入想问的问题，或者拖拽文件到这里..."
									rows={1}
									className="flex-1 max-h-36 resize-none bg-transparent px-2 py-3.5 outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 text-sm leading-relaxed"
								/>

								<div className="flex items-center gap-1 mb-1 mr-1">
									<ComposerPrimitive.Cancel className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-500 dark:hover:text-red-400 active:scale-95 cursor-pointer">
										<Trash2 className="h-4 w-4" />
									</ComposerPrimitive.Cancel>
									<ComposerPrimitive.Send asChild>
										<button
											type="submit"
											className="flex h-10 w-12 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
										>
											<Send className="h-4 w-4 ml-0.5" />
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

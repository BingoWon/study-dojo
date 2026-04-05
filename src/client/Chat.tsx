import {
	ActionBarPrimitive,
	AttachmentPrimitive,
	AuiIf,
	BranchPickerPrimitive,
	ComposerPrimitive,
	ErrorPrimitive,
	MessagePrimitive,
	ThreadPrimitive,
	useAui,
	useAuiState,
} from "@assistant-ui/react";
import "@assistant-ui/react-markdown/styles/dot.css";
import {
	AlertCircle,
	ArrowDown,
	ArrowUp,
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	Download,
	Loader2,
	Paperclip,
	Pencil,
	RefreshCw,
	Square,
	X,
} from "lucide-react";
import { createContext, type FC, useEffect } from "react";
import { Button } from "./components/ui/button";
import { MarkdownText } from "./components/ui/markdown-text";
import { TooltipIconButton } from "./components/ui/tooltip-icon-button";
import type { Recipe } from "./components/RecipePanel";
import { ReasoningPart } from "./components/message/ReasoningPart";
import { ToolCallFallback } from "./components/tools/ToolCallFallback";

// ── Recipe Update Context ────────────────────────────────────────────────────

export const RecipeUpdateCtx = createContext<
	((data: Partial<Recipe>) => void) | null
>(null);

// ── Attachment Components ────────────────────────────────────────────────────

const UserAttachment: FC = () => (
	<AttachmentPrimitive.Root className="group relative flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-white/5 px-3 py-2 border border-zinc-200/50 dark:border-white/5">
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

// ── Thread Welcome / Empty State ─────────────────────────────────────────────

const ThreadWelcome: FC = () => {
	const aui = useAui();

	const send = (text: string) => {
		aui.thread().append({
			role: "user",
			content: [{ type: "text", text }],
		});
	};

	return (
		<div className="mx-auto my-auto flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col">
			<div className="flex w-full flex-grow flex-col items-center justify-center">
				<div className="flex size-full flex-col justify-center px-8">
					<div className="text-4xl mb-4">🍳</div>
					<div className="text-2xl font-semibold text-zinc-800 dark:text-zinc-100">
						AI 食谱助手
					</div>
					<div className="text-lg text-zinc-500 dark:text-zinc-400">
						告诉我你想做什么菜
					</div>
				</div>
			</div>
			<div className="grid w-full gap-2 pb-4 md:grid-cols-3">
				{[
					{ title: "意大利面", desc: "做一道经典的意大利面" },
					{ title: "中式炒菜", desc: "做一道简单的家常炒菜" },
					{ title: "健康沙拉", desc: "做一份低卡健康沙拉" },
				].map((item) => (
					<ThreadPrimitive.Suggestion
						key={item.title}
						prompt={item.desc}
						asChild
					>
						<Button
							variant="ghost"
							className="h-auto w-full flex-col items-start justify-start gap-1 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-5 py-4 text-left text-sm"
							onClick={() => send(item.desc)}
						>
							<span className="font-medium text-zinc-800 dark:text-zinc-200">
								🍽️ {item.title}
							</span>
							<span className="text-zinc-500 dark:text-zinc-400">
								{item.desc}
							</span>
						</Button>
					</ThreadPrimitive.Suggestion>
				))}
			</div>
		</div>
	);
};

// ── Composer ──────────────────────────────────────────────────────────────────

const Composer: FC = () => (
	<ComposerPrimitive.Root className="relative flex w-full flex-col">
		<ComposerPrimitive.AttachmentDropzone className="flex w-full flex-col rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1 pt-2 outline-none transition-shadow has-[textarea:focus-visible]:border-blue-400/40 has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-blue-400/10 data-[dragging=true]:border-blue-400 data-[dragging=true]:border-dashed data-[dragging=true]:bg-blue-50 dark:data-[dragging=true]:bg-blue-950/30">
			<div className="flex flex-wrap gap-2 px-3 pt-1 pb-0 empty:hidden">
				<ComposerPrimitive.Attachments
					components={{ Attachment: ComposerAttachment }}
				/>
			</div>
			<ComposerPrimitive.Input
				placeholder="输入消息..."
				className="mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:ring-0"
				rows={1}
				autoFocus
			/>
			<ComposerAction />
		</ComposerPrimitive.AttachmentDropzone>
	</ComposerPrimitive.Root>
);

const ComposerAction: FC = () => (
	<div className="relative mx-2 mb-2 flex items-center justify-between">
		<ComposerPrimitive.AddAttachment
			className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 dark:text-zinc-500 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 active:scale-95 cursor-pointer"
			title="添加附件"
		>
			<Paperclip className="h-4 w-4" />
		</ComposerPrimitive.AddAttachment>

		<AuiIf condition={(s) => !s.thread.isRunning}>
			<ComposerPrimitive.Send asChild>
				<TooltipIconButton
					tooltip="发送消息"
					variant="default"
					size="icon"
					className="size-8 rounded-full"
				>
					<ArrowUp className="size-4" />
				</TooltipIconButton>
			</ComposerPrimitive.Send>
		</AuiIf>

		<AuiIf condition={(s) => s.thread.isRunning}>
			<ComposerPrimitive.Cancel asChild>
				<TooltipIconButton
					tooltip="停止生成"
					variant="default"
					size="icon"
					className="size-8 rounded-full"
				>
					<Square className="size-3 fill-current" />
				</TooltipIconButton>
			</ComposerPrimitive.Cancel>
		</AuiIf>
	</div>
);

// ── Scroll to Bottom ─────────────────────────────────────────────────────────

const ThreadScrollToBottom: FC = () => (
	<ThreadPrimitive.ScrollToBottom asChild>
		<TooltipIconButton
			tooltip="滚动到底部"
			variant="outline"
			className="absolute -top-10 z-10 self-center rounded-full size-8 shadow-md disabled:invisible"
		>
			<ArrowDown className="size-4" />
		</TooltipIconButton>
	</ThreadPrimitive.ScrollToBottom>
);

// ── User Message ─────────────────────────────────────────────────────────────

const UserMessage: FC = () => (
	<MessagePrimitive.Root
		className="mx-auto grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 fade-in slide-in-from-bottom-1 animate-in duration-150"
		data-role="user"
	>
		{/* Attachments row */}
		<div className="col-span-full col-start-1 row-start-1 flex flex-wrap gap-2 justify-end empty:hidden">
			<MessagePrimitive.Attachments
				components={{ Attachment: UserAttachment }}
			/>
		</div>

		<div className="relative col-start-2 min-w-0">
			<div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 break-words text-zinc-900 dark:text-zinc-100">
				<MessagePrimitive.Parts />
			</div>
			<div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
				<UserActionBar />
			</div>
		</div>

		<BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
	</MessagePrimitive.Root>
);

const UserActionBar: FC = () => (
	<ActionBarPrimitive.Root
		hideWhenRunning
		autohide="not-last"
		className="flex flex-col items-end"
	>
		<ActionBarPrimitive.Edit asChild>
			<TooltipIconButton tooltip="编辑" className="p-4">
				<Pencil className="h-4 w-4" />
			</TooltipIconButton>
		</ActionBarPrimitive.Edit>
	</ActionBarPrimitive.Root>
);

// ── Edit Composer ────────────────────────────────────────────────────────────

const EditComposer: FC = () => (
	<MessagePrimitive.Root className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col px-2 py-3">
		<ComposerPrimitive.Root className="ml-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-zinc-100 dark:bg-zinc-800">
			<ComposerPrimitive.Input
				className="min-h-14 w-full resize-none bg-transparent p-4 text-zinc-900 dark:text-zinc-100 text-sm outline-none"
				autoFocus
			/>
			<div className="mx-3 mb-3 flex items-center gap-2 self-end">
				<ComposerPrimitive.Cancel asChild>
					<Button variant="ghost" size="sm">
						取消
					</Button>
				</ComposerPrimitive.Cancel>
				<ComposerPrimitive.Send asChild>
					<Button size="sm">更新</Button>
				</ComposerPrimitive.Send>
			</div>
		</ComposerPrimitive.Root>
	</MessagePrimitive.Root>
);

// ── Assistant Message ────────────────────────────────────────────────────────

const AssistantMessage: FC = () => (
	<MessagePrimitive.Root
		className="relative mx-auto w-full max-w-[var(--thread-max-width)] py-3 fade-in slide-in-from-bottom-1 animate-in duration-150"
		data-role="assistant"
	>
		<div className="break-words px-2 leading-relaxed text-zinc-900 dark:text-zinc-100">
			<MessagePrimitive.Parts
				components={{
					Text: MarkdownText,
					Reasoning: ReasoningPart,
					tools: { Fallback: ToolCallFallback },
				}}
			/>
			<MessageError />
			<AuiIf
				condition={(s) =>
					s.thread.isRunning && s.message.content.length === 0
				}
			>
				<div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500">
					<Loader2 className="size-4 animate-spin" />
					<span className="text-sm">思考中...</span>
				</div>
			</AuiIf>
		</div>

		<div className="mt-1 ml-2 flex min-h-6 items-center gap-2">
			<MemoryBadge />
			<BranchPicker />
			<AssistantActionBar />
		</div>
	</MessagePrimitive.Root>
);

// ── Memory Badge (reads from message metadata, not data parts) ──────────────

const MemoryBadge: FC = () => {
	const metadata = useAuiState((s) => s.message.metadata) as
		| { mem0?: { memory: string; score: number }[] }
		| undefined;
	const memories = metadata?.mem0;
	if (!memories?.length) return null;

	return (
		<span className="text-[10px] text-indigo-500 dark:text-indigo-400">
			{memories.length} 条记忆已参考
		</span>
	);
};

const MessageError: FC = () => (
	<MessagePrimitive.Error>
		<ErrorPrimitive.Root className="mt-2 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 p-3 text-sm flex items-center gap-2">
			<AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
			<ErrorPrimitive.Message className="line-clamp-2 text-red-700 dark:text-red-300" />
		</ErrorPrimitive.Root>
	</MessagePrimitive.Error>
);

const AssistantActionBar: FC = () => (
	<ActionBarPrimitive.Root
		hideWhenRunning
		autohide="not-last"
		className="-ml-1 flex gap-1 text-zinc-400 dark:text-zinc-500"
	>
		<ActionBarPrimitive.Copy asChild>
			<TooltipIconButton tooltip="复制">
				<AuiIf condition={(s) => s.message.isCopied}>
					<Check className="h-4 w-4" />
				</AuiIf>
				<AuiIf condition={(s) => !s.message.isCopied}>
					<Copy className="h-4 w-4" />
				</AuiIf>
			</TooltipIconButton>
		</ActionBarPrimitive.Copy>
		<ActionBarPrimitive.ExportMarkdown asChild>
			<TooltipIconButton tooltip="导出 Markdown">
				<Download className="h-4 w-4" />
			</TooltipIconButton>
		</ActionBarPrimitive.ExportMarkdown>
		<ActionBarPrimitive.Reload asChild>
			<TooltipIconButton tooltip="重新生成">
				<RefreshCw className="h-4 w-4" />
			</TooltipIconButton>
		</ActionBarPrimitive.Reload>
	</ActionBarPrimitive.Root>
);

// ── Branch Picker ────────────────────────────────────────────────────────────

const BranchPicker: FC<{ className?: string }> = ({ className }) => (
	<BranchPickerPrimitive.Root
		hideWhenSingleBranch
		className={`mr-2 -ml-2 inline-flex items-center text-xs text-zinc-400 dark:text-zinc-500 ${className ?? ""}`}
	>
		<BranchPickerPrimitive.Previous asChild>
			<TooltipIconButton tooltip="上一条">
				<ChevronLeft className="h-4 w-4" />
			</TooltipIconButton>
		</BranchPickerPrimitive.Previous>
		<span className="font-medium">
			<BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
		</span>
		<BranchPickerPrimitive.Next asChild>
			<TooltipIconButton tooltip="下一条">
				<ChevronRight className="h-4 w-4" />
			</TooltipIconButton>
		</BranchPickerPrimitive.Next>
	</BranchPickerPrimitive.Root>
);

// ── Main Chat ─────────────────────────────────────────────────────────────────

export function Chat({
	recipe,
	onRecipeUpdate,
	onLoadingChange,
	registerImprove,
}: {
	recipe: Recipe;
	onRecipeUpdate: (partial: Partial<Recipe>) => void;
	onLoadingChange?: (loading: boolean) => void;
	registerImprove?: (fn: () => void) => void;
}) {
	const aui = useAui();
	const isRunning = useAuiState((s) => s.thread.isRunning);

	useEffect(() => {
		onLoadingChange?.(isRunning);
	}, [isRunning, onLoadingChange]);

	useEffect(() => {
		if (!registerImprove) return;
		registerImprove(() => {
			const recipeCtx = `当前食谱状态：${JSON.stringify(recipe)}`;
			aui.thread().append({
				role: "user",
				content: [
					{ type: "text", text: `请优化这个食谱，让它更好。${recipeCtx}` },
				],
			});
		});
	}, [registerImprove, recipe, aui]);

	return (
		<RecipeUpdateCtx value={onRecipeUpdate}>
			<ThreadPrimitive.Root
				className="flex h-full flex-col text-sm"
				style={
					{
						"--thread-max-width": "44rem",
					} as React.CSSProperties
				}
			>
				<ThreadPrimitive.Viewport
					turnAnchor="top"
					className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth px-4 pt-4"
				>
					{/* Existing thread loading → spinner; new thread → welcome */}
					<AuiIf
						condition={(s) =>
							s.thread.isEmpty && !!s.threadListItem.remoteId
						}
					>
						<div className="flex flex-1 items-center justify-center">
							<Loader2 className="h-5 w-5 animate-spin text-zinc-300 dark:text-zinc-600" />
						</div>
					</AuiIf>
					<AuiIf
						condition={(s) =>
							s.thread.isEmpty && !s.threadListItem.remoteId
						}
					>
						<ThreadWelcome />
					</AuiIf>

					<ThreadPrimitive.Messages
						components={{
							UserMessage,
							EditComposer,
							AssistantMessage,
						}}
					/>

					<ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto mt-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 overflow-visible rounded-t-3xl bg-gradient-to-t from-white via-white/90 dark:from-zinc-900 dark:via-zinc-900/90 to-transparent pb-4">
						<ThreadScrollToBottom />
						<Composer />
					</ThreadPrimitive.ViewportFooter>
				</ThreadPrimitive.Viewport>
			</ThreadPrimitive.Root>
		</RecipeUpdateCtx>
	);
}

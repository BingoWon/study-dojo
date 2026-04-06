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
	Mic,
	Paperclip,
	Pencil,
	RefreshCw,
	Square,
	Volume2,
	VolumeOff,
	X,
} from "lucide-react";
import { createContext, type FC, useEffect, useRef, useState } from "react";
import type { PersonaId } from "../worker/model";
import { ReasoningPart } from "./components/message/ReasoningPart";
import type { Recipe } from "./components/RecipePanel";
import { ToolCallFallback } from "./components/tools/ToolCallFallback";
import { Button } from "./components/ui/button";
import { MarkdownText } from "./components/ui/markdown-text";
import { TooltipIconButton } from "./components/ui/tooltip-icon-button";
import { usePersona } from "./RuntimeProvider";

// ── Recipe Update Context ────────────────────────────────────────────────────

export const RecipeUpdateCtx = createContext<
	((data: Partial<Recipe>) => void) | null
>(null);

// ── Document Select Context ─────────────────────────────────────────────────

export const DocSelectCtx = createContext<
	| ((
			docId: string,
			title: string,
			lang?: string | null,
			fileExt?: string | null,
	  ) => void)
	| null
>(null);

// ── Highlight Context ───────────────────────────────────────────────────────

export type HighlightItem = {
	id: string; // unique per highlight
	text: string | null; // null = full document
	color: string;
};

export type HighlightAction = {
	docId: string;
	text: string | null;
	color: string;
	title: string;
	lang?: string | null;
	fileExt?: string | null;
};

export const HighlightCtx = createContext<
	((action: HighlightAction) => void) | null
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

// ── Persona Definitions (client-side display config) ────────────────────────

const PERSONA_CARDS: {
	id: PersonaId;
	emoji: string;
	name: string;
	title: string;
	desc: string;
	gradient: string;
	border: string;
	glow: string;
}[] = [
	{
		id: "blank_f",
		emoji: "🌸",
		name: "温柔学姐",
		title: "耐心导师",
		desc: "温暖亲切，用生活化比喻把复杂论文讲明白",
		gradient: "from-pink-50 to-rose-50 dark:from-pink-950 dark:to-rose-950",
		border: "border-pink-300 dark:border-pink-700",
		glow: "shadow-pink-400/30 dark:shadow-pink-600/20",
	},
	{
		id: "blank_m",
		emoji: "📐",
		name: "学术老哥",
		title: "务实派",
		desc: "直来直去，一句话帮你抓住论文核心",
		gradient: "from-sky-50 to-cyan-50 dark:from-sky-950 dark:to-cyan-950",
		border: "border-sky-300 dark:border-sky-700",
		glow: "shadow-sky-400/30 dark:shadow-sky-600/20",
	},
	{
		id: "professor",
		emoji: "⚡",
		name: "暴躁教授",
		title: "雷电将军",
		desc: "尖酸刻薄的毒舌学者，永远对你不满意",
		gradient:
			"from-purple-100 to-indigo-50 dark:from-purple-950 dark:to-indigo-950",
		border: "border-purple-300 dark:border-purple-700",
		glow: "shadow-purple-400/30 dark:shadow-purple-600/20",
	},
	{
		id: "keli",
		emoji: "💥",
		name: "可莉教授",
		title: "爆炸专家",
		desc: "活泼天真的炼金天才，用蹦蹦炸弹讲学术",
		gradient: "from-red-50 to-orange-50 dark:from-red-950 dark:to-orange-950",
		border: "border-red-300 dark:border-red-700",
		glow: "shadow-red-400/30 dark:shadow-red-600/20",
	},
];

// ── Persona Selection (replaces old ThreadWelcome) ──────────────────────────

const PersonaSelect: FC = () => {
	const { persona, setPersona } = usePersona();

	return (
		<div className="mx-auto my-auto flex w-full max-w-md flex-grow flex-col items-center justify-center gap-6 px-4">
			<div className="text-center">
				<div className="text-sm font-medium tracking-widest uppercase text-zinc-400 dark:text-zinc-500 mb-2">
					选择你的导师
				</div>
				<div className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
					开始论文陪读之旅
				</div>
			</div>

			<div className="flex w-full flex-col gap-3">
				{PERSONA_CARDS.map((card) => {
					const selected = persona === card.id;
					return (
						<button
							key={card.id}
							type="button"
							onClick={() => setPersona(card.id)}
							className={`
								group relative w-full flex items-center gap-4 rounded-2xl p-4
								bg-gradient-to-r ${card.gradient}
								border-2 transition-all duration-200 cursor-pointer
								${
									selected
										? `${card.border} shadow-lg ${card.glow} scale-[1.02]`
										: "border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 hover:shadow-md"
								}
							`}
						>
							{/* Selection indicator */}
							<div
								className={`
									absolute -left-px top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full
									transition-all duration-200
									${selected ? "bg-current opacity-100" : "opacity-0"}
								`}
								style={{
									color:
										card.id === "blank_f"
											? "#ec4899"
											: card.id === "blank_m"
												? "#0ea5e9"
												: card.id === "professor"
													? "#a855f7"
													: "#ef4444",
								}}
							/>

							{/* Emoji avatar */}
							<div
								className={`
									flex-shrink-0 flex items-center justify-center
									w-14 h-14 rounded-xl text-3xl
									transition-transform duration-200
									${selected ? "scale-110" : "group-hover:scale-105"}
									bg-white/60 dark:bg-white/5 backdrop-blur-sm
									ring-1 ring-black/5 dark:ring-white/10
								`}
							>
								{card.emoji}
							</div>

							{/* Info */}
							<div className="flex-1 text-left min-w-0">
								<div className="flex items-center gap-2">
									<span className="font-bold text-zinc-900 dark:text-zinc-100">
										{card.name}
									</span>
									<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 font-medium">
										{card.title}
									</span>
								</div>
								<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
									{card.desc}
								</p>
							</div>

							{/* Check mark */}
							<div
								className={`
									flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
									transition-all duration-200
									${
										selected
											? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 scale-100"
											: "bg-zinc-200 dark:bg-zinc-700 scale-90 opacity-0 group-hover:opacity-50"
									}
								`}
							>
								<Check className="w-3.5 h-3.5" />
							</div>
						</button>
					);
				})}
			</div>

			<p className="text-[11px] text-zinc-400 dark:text-zinc-600 text-center">
				在下方输入消息开始对话 · 输入框左下角可随时切换角色
			</p>
		</div>
	);
};

// ── Composer ──────────────────────────────────────────────────────────────────

const PERSONA_PLACEHOLDERS: Record<PersonaId, string> = {
	blank_f: "向学姐请教论文问题...",
	blank_m: "让老哥帮你拆解论文...",
	professor: "你确定准备好面对教授了？",
	keli: "和可莉一起探索论文吧！",
};

const Composer: FC = () => {
	const { persona } = usePersona();
	return (
		<ComposerPrimitive.Root className="relative flex w-full flex-col">
			<ComposerPrimitive.AttachmentDropzone className="flex w-full flex-col rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1 pt-2 outline-none transition-shadow has-[textarea:focus-visible]:border-blue-400/40 has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-blue-400/10 data-[dragging=true]:border-blue-400 data-[dragging=true]:border-dashed data-[dragging=true]:bg-blue-50 dark:data-[dragging=true]:bg-blue-950/30">
				<div className="flex flex-wrap gap-2 px-3 pt-1 pb-0 empty:hidden">
					<ComposerPrimitive.Attachments
						components={{ Attachment: ComposerAttachment }}
					/>
				</div>
				<ComposerPrimitive.Input
					placeholder={PERSONA_PLACEHOLDERS[persona]}
					className="mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:ring-0"
					rows={1}
					autoFocus
					spellCheck={false}
					autoComplete="off"
				/>
				<ComposerAction />
			</ComposerPrimitive.AttachmentDropzone>
		</ComposerPrimitive.Root>
	);
};

// ── Persona Switcher (popover in composer) ──────────────────────────────────

const PersonaSwitcher: FC = () => {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const aui = useAui();
	const { persona, setPersona } = usePersona();
	const current = PERSONA_CARDS.find((c) => c.id === persona);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const handleSelect = (id: PersonaId) => {
		if (id === persona) {
			setOpen(false);
			return;
		}
		setPersona(id);
		setOpen(false);
		// Switching persona = start a new thread
		aui.threads().switchToNewThread();
	};

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all hover:bg-zinc-100 dark:hover:bg-zinc-700 active:scale-95 cursor-pointer text-base"
				title={`当前角色：${current?.name ?? ""}`}
			>
				{current?.emoji ?? "⚡"}
			</button>

			{open && (
				<div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
					<div className="px-2 py-1.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
						切换角色（新对话）
					</div>
					{PERSONA_CARDS.map((card) => {
						const active = persona === card.id;
						return (
							<button
								key={card.id}
								type="button"
								onClick={() => handleSelect(card.id)}
								className={`
									w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors cursor-pointer
									${active ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"}
								`}
							>
								<span className="text-lg shrink-0">{card.emoji}</span>
								<div className="min-w-0 flex-1">
									<div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
										{card.name}
									</div>
									<div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
										{card.desc}
									</div>
								</div>
								{active && (
									<Check className="w-3.5 h-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
								)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
};

const ComposerAction: FC = () => (
	<div className="relative mx-2 mb-2 flex items-center justify-between">
		<div className="flex items-center gap-1">
			<PersonaSwitcher />

			<ComposerPrimitive.AddAttachment
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 dark:text-zinc-500 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 active:scale-95 cursor-pointer"
				title="添加附件"
			>
				<Paperclip className="h-4 w-4" />
			</ComposerPrimitive.AddAttachment>

			{/* Dictation: mic button (hidden when no adapter or already dictating) */}
			<AuiIf condition={(s) => s.composer.dictation == null}>
				<ComposerPrimitive.Dictate asChild>
					<TooltipIconButton
						tooltip="语音输入"
						className="size-8 rounded-full text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
					>
						<Mic className="h-4 w-4" />
					</TooltipIconButton>
				</ComposerPrimitive.Dictate>
			</AuiIf>

			{/* Dictation: stop button (shown only while dictating) */}
			<AuiIf condition={(s) => s.composer.dictation != null}>
				<ComposerPrimitive.StopDictation asChild>
					<TooltipIconButton
						tooltip="停止语音输入"
						className="size-8 rounded-full text-red-500 animate-pulse"
					>
						<Square className="h-3 w-3 fill-current" />
					</TooltipIconButton>
				</ComposerPrimitive.StopDictation>
			</AuiIf>
		</div>

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

const UserText: FC<{ text: string }> = ({ text }) => <>{text.trim()}</>;

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
			<div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 break-words text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
				<MessagePrimitive.Parts components={{ Text: UserText }} />
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
				condition={(s) => s.thread.isRunning && s.message.content.length === 0}
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

const SpeakButton: FC = () => {
	const speech = useAuiState((s) => s.message.speech);
	if (!speech) {
		return (
			<ActionBarPrimitive.Speak asChild>
				<TooltipIconButton tooltip="朗读">
					<Volume2 className="h-4 w-4" />
				</TooltipIconButton>
			</ActionBarPrimitive.Speak>
		);
	}
	if (speech.status.type === "starting") {
		return (
			<ActionBarPrimitive.StopSpeaking asChild>
				<TooltipIconButton tooltip="加载中...">
					<Loader2 className="h-4 w-4 animate-spin" />
				</TooltipIconButton>
			</ActionBarPrimitive.StopSpeaking>
		);
	}
	return (
		<ActionBarPrimitive.StopSpeaking asChild>
			<TooltipIconButton tooltip="停止朗读">
				<VolumeOff className="h-4 w-4" />
			</TooltipIconButton>
		</ActionBarPrimitive.StopSpeaking>
	);
};

const AssistantActionBar: FC = () => (
	<ActionBarPrimitive.Root
		hideWhenRunning
		autohide="not-last"
		className="-ml-1 flex gap-1 text-zinc-400 dark:text-zinc-500"
	>
		<SpeakButton />
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
	onDocSelect,
	onHighlight,
	onLoadingChange,
	registerImprove,
}: {
	recipe: Recipe;
	onRecipeUpdate: (partial: Partial<Recipe>) => void;
	onDocSelect?: (
		docId: string,
		title: string,
		lang?: string | null,
		fileExt?: string | null,
	) => void;
	onHighlight?: (action: HighlightAction) => void;
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
			<DocSelectCtx value={onDocSelect ?? null}>
				<HighlightCtx value={onHighlight ?? null}>
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
								<PersonaSelect />
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
				</HighlightCtx>
			</DocSelectCtx>
		</RecipeUpdateCtx>
	);
}

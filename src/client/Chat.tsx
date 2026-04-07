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
	Sparkles,
	Square,
	Volume2,
	VolumeOff,
	X,
} from "lucide-react";
import {
	createContext,
	type FC,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { PERSONAS, type PersonaId } from "../worker/model";
import { CharacterAvatar } from "./components/CharacterAvatar";
import { ReasoningPart } from "./components/message/ReasoningPart";
import type { Recipe } from "./components/RecipePanel";
import { ToolCallFallback } from "./components/tools/ToolCallFallback";
import { Button } from "./components/ui/button";
import { MarkdownText } from "./components/ui/markdown-text";
import { TooltipIconButton } from "./components/ui/tooltip-icon-button";
import { getNextPlaceholder } from "./lib/greeting";
import {
	setThreadPersona,
	useAutoTTS,
	useDialogueMode,
	usePersona,
	useVoiceMode,
} from "./RuntimeProvider";

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

// ── Persona card list (derived from single source of truth in PERSONAS) ─────

const PERSONA_IDS: PersonaId[] = ["raiden", "keli", "shiyu", "yixuan"];

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

			<div className="flex w-full flex-col gap-8 pt-8">
				{PERSONA_IDS.map((id) => {
					const p = PERSONAS[id];
					const selected = persona === id;
					return (
						<button
							key={id}
							type="button"
							onClick={() => setPersona(id)}
							className={`
								group relative w-full rounded-2xl overflow-visible cursor-pointer
								transition-all duration-300
								${selected ? "scale-[1.02]" : ""}
							`}
						>
							{/* Card body — pl-20 reserves space for the avatar area */}
							<div
								className={`
									relative rounded-2xl py-3.5 pr-4 pl-[108px]
									bg-gradient-to-r ${p.gradient}
									border-2 transition-all duration-300 overflow-hidden
									${
										selected
											? `${p.border} shadow-xl ${p.glow}`
											: "border-transparent group-hover:border-zinc-200/80 dark:group-hover:border-zinc-700/60 group-hover:shadow-lg"
									}
								`}
							>
								{/* Shimmer sweep */}
								<div className={`shimmer-sweep ${selected ? "active" : ""}`} />

								{/* Info */}
								<div className="text-left min-w-0 relative z-10">
									<div className="flex items-center gap-2">
										<span className="font-bold text-zinc-900 dark:text-zinc-100">
											{p.name}
										</span>
										<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 font-medium">
											{p.title}
										</span>
									</div>
									<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
										{p.desc}
									</p>
								</div>
							</div>

							{/* Selection check — overflows right edge of card */}
							<div
								className={`
									absolute -right-3 top-1/2 -translate-y-1/2 z-20
									w-8 h-8 rounded-full flex items-center justify-center
									shadow-lg transition-all duration-300
									${selected ? "opacity-100 scale-100" : "opacity-0 scale-0"}
								`}
								style={{ backgroundColor: p.accentColor }}
							>
								<Check className="w-4.5 h-4.5 text-white" strokeWidth={3} />
							</div>

							{/* Avatar — 88px square, bottom flush with card, top ~1/3 overflows */}
							<img
								src={`/characters/${id}/avatars/neutral.webp`}
								alt={p.name}
								draggable={false}
								className={`
									absolute left-3 bottom-0 w-[88px] h-[88px] z-10
									object-cover select-none
									transition-all duration-300 ease-out
									${selected ? "scale-110 -translate-y-1 drop-shadow-xl" : "group-hover:scale-105 group-hover:-translate-y-0.5 drop-shadow-md"}
								`}
							/>
						</button>
					);
				})}
			</div>

			<div className="w-full pt-4">
				<ModeButtons variant="card" />
			</div>

			<p className="text-[11px] text-zinc-400 dark:text-zinc-600 text-center">
				在下方输入消息开始文字对话 · 输入框左下角可随时切换角色和模式
			</p>
		</div>
	);
};

// ── Composer ──────────────────────────────────────────────────────────────────

const Composer: FC = () => {
	const { persona } = usePersona();
	// Cycle placeholder once per persona switch (stable across re-renders)
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const placeholder = useMemo(() => getNextPlaceholder(persona), [persona]);
	return (
		<ComposerPrimitive.Root className="relative flex w-full flex-col">
			<ComposerPrimitive.AttachmentDropzone className="flex w-full flex-col rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1 pt-2 outline-none transition-shadow has-[textarea:focus-visible]:border-blue-400/40 has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-blue-400/10 data-[dragging=true]:border-blue-400 data-[dragging=true]:border-dashed data-[dragging=true]:bg-blue-50 dark:data-[dragging=true]:bg-blue-950/30">
				<div className="flex flex-wrap gap-2 px-3 pt-1 pb-0 empty:hidden">
					<ComposerPrimitive.Attachments
						components={{ Attachment: ComposerAttachment }}
					/>
				</div>
				<ComposerPrimitive.Input
					placeholder={placeholder}
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
	const current = PERSONAS[persona];

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
		// Update local cache + persist to DB
		const remoteId = aui.threadListItem().getState().remoteId;
		if (remoteId) {
			setThreadPersona(remoteId, id);
			fetch(`/api/threads/${remoteId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ persona: id }),
			}).catch(() => {});
		}
	};

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all hover:bg-zinc-100 dark:hover:bg-zinc-700 active:scale-95 cursor-pointer text-base"
				title={`当前角色：${current.name}`}
			>
				<CharacterAvatar persona={persona} size="sm" />
			</button>

			{open && (
				<div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
					<div className="px-2 py-1.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
						切换角色
					</div>
					{PERSONA_IDS.map((id) => {
						const c = PERSONAS[id];
						const active = persona === id;
						return (
							<button
								key={id}
								type="button"
								onClick={() => handleSelect(id)}
								className={`
									w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors cursor-pointer
									${active ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"}
								`}
							>
								<CharacterAvatar persona={id} size="sm" />
								<div className="min-w-0 flex-1">
									<div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
										{c.name}
									</div>
									<div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
										{c.desc}
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

const AutoTTSToggle: FC = () => {
	const { autoTTS, setAutoTTS } = useAutoTTS();
	return (
		<button
			type="button"
			onClick={() => setAutoTTS(!autoTTS)}
			className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer ${
				autoTTS
					? "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
					: "text-zinc-300 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700"
			}`}
			title={autoTTS ? "自动朗读：开启" : "自动朗读：关闭"}
		>
			{autoTTS ? (
				<Volume2 className="h-4 w-4" />
			) : (
				<VolumeOff className="h-4 w-4" />
			)}
		</button>
	);
};

/** Shared mode entry buttons — `compact` for composer bar, `card` for persona panel. */
const ModeButtons: FC<{ variant?: "compact" | "card" }> = ({
	variant = "compact",
}) => {
	const { enterVoiceMode } = useVoiceMode();
	const { enterDialogueMode } = useDialogueMode();
	const threadId = useAuiState(
		(s) => s.threadListItem.remoteId as string | undefined,
	);

	if (variant === "card") {
		return (
			<div className="flex w-full gap-3">
				<button
					type="button"
					onClick={() => enterVoiceMode(threadId)}
					className="group relative flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
						bg-purple-50 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/40
						text-purple-600 dark:text-purple-400 text-xs font-semibold
						transition-all hover:shadow-lg hover:shadow-purple-500/10 hover:scale-[1.02] active:scale-[0.98] cursor-pointer overflow-hidden"
				>
					<div className="shimmer-sweep group-hover:active" />
					<Mic className="h-3.5 w-3.5 relative z-10" />
					<span className="relative z-10">语音伴读</span>
				</button>
				<button
					type="button"
					onClick={() => enterDialogueMode(threadId)}
					className="group relative flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
						bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40
						text-amber-600 dark:text-amber-400 text-xs font-semibold
						transition-all hover:shadow-lg hover:shadow-amber-500/10 hover:scale-[1.02] active:scale-[0.98] cursor-pointer overflow-hidden"
				>
					<div className="shimmer-sweep group-hover:active" />
					<Sparkles className="h-3.5 w-3.5 relative z-10" />
					<span className="relative z-10">剧情伴读</span>
				</button>
			</div>
		);
	}

	return (
		<>
			<button
				type="button"
				onClick={() => enterVoiceMode(threadId)}
				className="flex h-7 shrink-0 items-center gap-1 px-2.5 rounded-full text-[11px] font-medium
					text-zinc-400 dark:text-zinc-500 transition-all
					hover:bg-purple-50 dark:hover:bg-purple-950/30 hover:text-purple-600 dark:hover:text-purple-400
					active:scale-95 cursor-pointer"
				title="语音伴读"
			>
				<Mic className="h-3.5 w-3.5" />
				语音
			</button>
			<button
				type="button"
				onClick={() => enterDialogueMode(threadId)}
				className="flex h-7 shrink-0 items-center gap-1 px-2.5 rounded-full text-[11px] font-medium
					text-zinc-400 dark:text-zinc-500 transition-all
					hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-600 dark:hover:text-amber-400
					active:scale-95 cursor-pointer"
				title="剧情伴读"
			>
				<Sparkles className="h-3.5 w-3.5" />
				剧情
			</button>
		</>
	);
};

const ComposerAction: FC = () => (
	<div className="relative mx-2 mb-2 flex items-center justify-between">
		{/* Left: persona + mode buttons */}
		<div className="flex items-center gap-1">
			<PersonaSwitcher />
			<div className="ml-1 flex items-center gap-0.5">
				<ModeButtons />
			</div>
		</div>

		{/* Right: TTS, attachment, dictation, send */}
		<div className="flex items-center gap-1">
			<AutoTTSToggle />

			<ComposerPrimitive.AddAttachment
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 dark:text-zinc-500 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 active:scale-95 cursor-pointer"
				title="添加附件"
			>
				<Paperclip className="h-4 w-4" />
			</ComposerPrimitive.AddAttachment>

			{/* Dictation: mic button */}
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

			{/* Dictation: stop button */}
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
				<Pencil className="h-4 w-4 text-zinc-400" />
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

// ── Reasoning dedup context ──────────────────────────────────────────────────

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
							{/* Loading → spinner */}
							<AuiIf condition={(s) => s.thread.isEmpty && s.thread.isLoading}>
								<div className="flex flex-1 items-center justify-center">
									<Loader2 className="h-5 w-5 animate-spin text-zinc-300 dark:text-zinc-600" />
								</div>
							</AuiIf>
							{/* Loaded but empty with remoteId → orphaned thread */}
							<AuiIf
								condition={(s) =>
									s.thread.isEmpty &&
									!s.thread.isLoading &&
									!!s.threadListItem.remoteId
								}
							>
								<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center px-8">
									<div className="text-sm text-zinc-500 dark:text-zinc-400">
										该对话没有消息记录
									</div>
									<div className="text-xs text-zinc-400 dark:text-zinc-500">
										可能是之前的操作异常导致，请开启新对话
									</div>
								</div>
							</AuiIf>
							{/* New thread → persona selection */}
							<AuiIf
								condition={(s) =>
									s.thread.isEmpty &&
									!s.thread.isLoading &&
									!s.threadListItem.remoteId
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

							<AuiIf
								condition={(s) =>
									!(
										s.thread.isEmpty &&
										!s.thread.isLoading &&
										!!s.threadListItem.remoteId
									)
								}
							>
								<ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto mt-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 overflow-visible rounded-t-3xl bg-gradient-to-t from-white via-white/90 dark:from-zinc-900 dark:via-zinc-900/90 to-transparent pb-4">
									<ThreadScrollToBottom />
									<Composer />
								</ThreadPrimitive.ViewportFooter>
							</AuiIf>
						</ThreadPrimitive.Viewport>
					</ThreadPrimitive.Root>
				</HighlightCtx>
			</DocSelectCtx>
		</RecipeUpdateCtx>
	);
}

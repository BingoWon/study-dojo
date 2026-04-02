import { useChat } from "@ai-sdk/react";
import {
	ActionBarPrimitive,
	AssistantRuntimeProvider,
	AttachmentPrimitive,
	BranchPickerPrimitive,
	ComposerPrimitive,
	MessagePrimitive,
	ThreadPrimitive,
	type ToolCallMessagePartProps,
	useMessagePartReasoning,
	useMessagePartText,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import {
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
	User,
	Wrench,
	X,
	Zap,
} from "lucide-react";
import { type FC, useState } from "react";

// ── Reasoning Part ────────────────────────────────────────────────────────────

const ReasoningPart: FC = () => {
	const reasoning = useMessagePartReasoning();
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);

	if (!reasoning?.text) return null;

	const isStreaming = reasoning.status?.type === "running";

	const handleCopy = () => {
		navigator.clipboard.writeText(reasoning.text ?? "");
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div className="mb-2 rounded-2xl border border-violet-500/15 bg-violet-950/20 overflow-hidden transition-all duration-300">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-violet-500/5 transition-colors group"
			>
				<span className="relative flex h-2.5 w-2.5 shrink-0">
					{isStreaming ? (
						<>
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
							<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500" />
						</>
					) : (
						<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500/50" />
					)}
				</span>
				<span className="text-[11px] font-semibold text-violet-400/80 tracking-widest uppercase select-none">
					{isStreaming ? "Thinking…" : "Reasoning"}
				</span>
				{!isStreaming && reasoning.text && (
					<span className="ml-1 text-[10px] text-violet-500/40 truncate max-w-[200px] hidden sm:block">
						{reasoning.text.slice(0, 60).replace(/\n/g, " ")}…
					</span>
				)}
				<ChevronDown
					className={`ml-auto h-3 w-3 text-violet-500/40 transition-transform duration-200 group-hover:text-violet-400/60 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{open && (
				<div className="border-t border-violet-500/10">
					<div className="relative max-h-72 overflow-y-auto px-4 py-3 scrollbar-thin scrollbar-thumb-violet-500/20">
						<p className="text-[11px] leading-relaxed text-violet-300/60 font-mono whitespace-pre-wrap">
							{reasoning.text}
						</p>
					</div>
					<div className="flex justify-end px-4 py-2 border-t border-violet-500/10">
						<button
							type="button"
							onClick={handleCopy}
							className="flex items-center gap-1.5 text-[10px] text-violet-500/50 hover:text-violet-400/80 transition-colors"
						>
							{copied ? (
								<Check className="h-3 w-3 text-green-400" />
							) : (
								<Copy className="h-3 w-3" />
							)}
							{copied ? "Copied" : "Copy"}
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

// ── Text Part ─────────────────────────────────────────────────────────────────

const TextPart: FC = () => {
	const { text } = useMessagePartText();
	if (!text) return null;
	return (
		<div className="relative rounded-3xl rounded-tl-sm bg-zinc-900/80 px-6 py-4 text-zinc-200 shadow-xl border border-white/5 backdrop-blur-xl transition-all hover:border-white/10">
			<p className="leading-relaxed whitespace-pre-wrap text-sm">{text}</p>
		</div>
	);
};

// ── Tool Call Part ────────────────────────────────────────────────────────────
// Registered as tools.Fallback — receives ToolCallMessagePartProps directly as FC props

const ToolCallPart: FC<ToolCallMessagePartProps> = ({
	toolName,
	args,
	argsText,
	result,
	isError,
}) => {
	const [open, setOpen] = useState(true);

	const hasResult = result !== undefined;
	const statusColor = isError
		? "text-red-400 border-red-500/20 bg-red-950/20"
		: hasResult
			? "text-green-400 border-green-500/20 bg-green-950/20"
			: "text-amber-400 border-amber-500/20 bg-amber-950/20";

	return (
		<div
			className={`mb-2 rounded-2xl border overflow-hidden transition-all duration-200 ${statusColor}`}
		>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
			>
				<Wrench className="h-3.5 w-3.5 shrink-0" />
				<span className="text-[11px] font-semibold tracking-wider uppercase select-none">
					{toolName}
				</span>
				{isError && <span className="ml-1 text-[10px] opacity-60">Error</span>}
				{hasResult && !isError && (
					<span className="ml-1 text-[10px] opacity-50">Done</span>
				)}
				{!hasResult && !isError && (
					<span className="ml-1 flex items-center gap-1 text-[10px] opacity-60">
						<span className="animate-pulse">Running</span>
						<Zap className="h-2.5 w-2.5 animate-pulse" />
					</span>
				)}
				<ChevronDown
					className={`ml-auto h-3 w-3 opacity-40 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{open && (
				<div className="border-t border-current/10 divide-y divide-current/10">
					{(args || argsText) && (
						<div className="px-4 py-3">
							<div className="text-[10px] opacity-50 uppercase tracking-widest mb-1.5">
								Args
							</div>
							<pre className="text-[11px] opacity-70 font-mono whitespace-pre-wrap break-all">
								{argsText || JSON.stringify(args, null, 2)}
							</pre>
						</div>
					)}
					{result !== undefined && (
						<div className="px-4 py-3">
							<div className="text-[10px] opacity-50 uppercase tracking-widest mb-1.5">
								Result
							</div>
							<pre className="text-[11px] opacity-70 font-mono whitespace-pre-wrap break-all">
								{typeof result === "string"
									? result
									: JSON.stringify(result, null, 2)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

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
				title="Copy"
			>
				<Copy className="h-3 w-3" />
			</button>
		</ActionBarPrimitive.Copy>
		<ActionBarPrimitive.Reload asChild>
			<button
				type="button"
				className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-all"
				title="Regenerate"
			>
				<RefreshCw className="h-3 w-3" />
			</button>
		</ActionBarPrimitive.Reload>
		<AssistantBranchPicker />
	</ActionBarPrimitive.Root>
);

// ── Attachment components ─────────────────────────────────────────────────────

const UserAttachment: FC = () => (
	<AttachmentPrimitive.Root className="group relative flex h-14 w-40 items-center justify-between rounded-xl bg-black/10 px-3 py-2 backdrop-blur-md border border-white/5 transition-all hover:bg-black/20">
		<div className="flex items-center gap-2 overflow-hidden">
			<AttachmentPrimitive.unstable_Thumb className="h-10 w-10 shrink-0 rounded-lg bg-white/10 object-cover" />
			<span className="truncate text-xs font-medium text-white/80">
				<AttachmentPrimitive.Name />
			</span>
		</div>
	</AttachmentPrimitive.Root>
);

const ComposerAttachment: FC = () => (
	<AttachmentPrimitive.Root className="group relative flex h-16 w-48 items-center justify-between rounded-2xl bg-zinc-800/80 px-3 py-2 shadow-inner border border-white/5">
		<div className="flex items-center gap-3 overflow-hidden">
			<AttachmentPrimitive.unstable_Thumb className="h-12 w-12 shrink-0 rounded-xl bg-zinc-900 object-cover shadow-sm" />
			<span className="truncate text-xs font-semibold text-zinc-300">
				<AttachmentPrimitive.Name />
			</span>
		</div>
		<AttachmentPrimitive.Remove className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-transform hover:scale-110 active:scale-95">
			<X className="w-3.5 h-3.5" />
		</AttachmentPrimitive.Remove>
	</AttachmentPrimitive.Root>
);

// ── Message components ────────────────────────────────────────────────────────

const UserMessage: FC = () => (
	<MessagePrimitive.Root className="ml-auto flex max-w-[85%] flex-col items-end mb-6 group">
		<div className="flex items-center gap-2 mb-2">
			<span className="text-xs font-medium text-zinc-500">You</span>
			<div className="h-6 w-6 rounded-full bg-gradient-to-tr from-orange-400 to-amber-600 flex items-center justify-center text-white shadow-lg">
				<User className="w-3.5 h-3.5" />
			</div>
		</div>
		<div className="relative rounded-3xl rounded-tr-sm bg-gradient-to-br from-zinc-800 to-zinc-900 px-6 py-4 text-zinc-100 shadow-2xl border border-white/5 backdrop-blur-xl">
			<div className="mb-3 flex flex-wrap gap-2 empty:hidden">
				<MessagePrimitive.Attachments
					components={{ Attachment: UserAttachment }}
				/>
			</div>
			<div className="leading-relaxed whitespace-pre-wrap text-sm flex flex-col gap-2">
				<MessagePrimitive.Parts />
			</div>
		</div>
		{/* User action bar */}
		<ActionBarPrimitive.Root
			hideWhenRunning
			autohide="not-last"
			className="flex items-center gap-1 mt-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
		>
			<ActionBarPrimitive.Edit asChild>
				<button
					type="button"
					className="inline-flex items-center gap-1 px-2 h-6 rounded text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-all"
				>
					Edit
				</button>
			</ActionBarPrimitive.Edit>
		</ActionBarPrimitive.Root>
	</MessagePrimitive.Root>
);

const AssistantMessage: FC = () => (
	<MessagePrimitive.Root className="mr-auto flex max-w-[85%] flex-col items-start mb-6 group">
		{/* Avatar + name */}
		<div className="flex items-center gap-2 mb-2">
			<div className="relative h-6 w-6 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-300 shadow-lg">
				<Bot className="w-3.5 h-3.5" />
				{/* Live indicator — visible when this message is last & thread is running */}
				<MessagePrimitive.If last>
					<ThreadPrimitive.If running>
						<span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
							<span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
						</span>
					</ThreadPrimitive.If>
				</MessagePrimitive.If>
			</div>
			<span className="text-xs font-semibold text-zinc-400 tracking-wider">
				AI Agent
			</span>
		</div>

		{/* All parts: reasoning → tool calls → text */}
		<div className="w-full flex flex-col">
			<MessagePrimitive.Parts
				components={{
					Text: TextPart,
					Reasoning: ReasoningPart,
					tools: { Fallback: ToolCallPart },
				}}
			/>
		</div>

		{/* Action bar + branch picker */}
		<AssistantActionBar />
	</MessagePrimitive.Root>
);

// ── Empty state ────────────────────────────────────────────────────────────────

const EmptyState: FC = () => (
	<div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 animate-in fade-in duration-700 pointer-events-none select-none">
		<div className="w-20 h-20 mb-6 rounded-3xl bg-zinc-900 border border-white/5 flex items-center justify-center shadow-2xl pointer-events-none ring-1 ring-white/10">
			<Bot className="w-10 h-10 text-zinc-400" />
		</div>
		<h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-zinc-500 mb-3 tracking-tight">
			AI Playground
		</h2>
		<p className="text-zinc-500 max-w-sm mx-auto text-sm leading-relaxed mb-8">
			Test and validate language models, tools, reasoning capabilities, and
			multimodal handling in a modern UI framework.
		</p>
		{/* Feature badges */}
		<div className="flex flex-wrap items-center justify-center gap-2 max-w-xs">
			{[
				{
					label: "Reasoning",
					color: "bg-violet-500/10 text-violet-400 border-violet-500/20",
				},
				{
					label: "Multimodal",
					color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
				},
				{
					label: "Vision",
					color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
				},
				{
					label: "Tool Use",
					color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
				},
				{
					label: "Branching",
					color: "bg-green-500/10 text-green-400 border-green-500/20",
				},
			].map((f) => (
				<span
					key={f.label}
					className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border tracking-wide ${f.color}`}
				>
					{f.label}
				</span>
			))}
		</div>
	</div>
);

// ── Main Chat ─────────────────────────────────────────────────────────────────

export function Chat() {
	const chat = useChat({
		onError: (err: unknown) => {
			console.error("[Frontend] Chat Error:", err);
		},
		onFinish: (msg) => {
			console.log("[Frontend] Chat Finished:", msg);
		},
	});
	const runtime = useAISDKRuntime(chat);

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			<div className="flex h-full w-full flex-col bg-[#09090b] relative overflow-hidden font-sans">
				{/* Ambient glow */}
				<div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

				<ThreadPrimitive.Root className="flex flex-col h-full w-full max-w-3xl mx-auto relative z-10">
					{/* Messages viewport */}
					<ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 md:px-6 py-8 scroll-smooth">
						{/* Empty state */}
						<ThreadPrimitive.Empty>
							<EmptyState />
						</ThreadPrimitive.Empty>

						<ThreadPrimitive.Messages
							components={{ UserMessage, AssistantMessage }}
						/>

						{/* Scroll anchor */}
						<ThreadPrimitive.ScrollToBottom className="fixed bottom-36 right-1/2 translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 shadow-lg transition-all opacity-0 data-[visible]:opacity-100 z-20">
							<ChevronDown className="h-4 w-4" />
						</ThreadPrimitive.ScrollToBottom>
					</ThreadPrimitive.Viewport>

					{/* Composer */}
					<ThreadPrimitive.ViewportFooter className="pb-8 pt-4 px-4 md:px-6 sticky bottom-0 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent backdrop-blur-sm">
						<ComposerPrimitive.Root className="flex w-full flex-col gap-3 rounded-3xl bg-zinc-900/60 p-3 shadow-2xl border border-zinc-800 backdrop-blur-2xl transition-all focus-within:border-blue-500/30 focus-within:bg-zinc-900/80 focus-within:ring-4 focus-within:ring-blue-500/8">
							{/* Attachment previews */}
							<div className="flex flex-wrap gap-3 px-2 pt-2 empty:hidden">
								<ComposerPrimitive.Attachments
									components={{ Attachment: ComposerAttachment }}
								/>
							</div>
							<div className="flex items-end gap-2">
								<ComposerPrimitive.AddAttachment
									className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-100 active:scale-95"
									title="Attach file"
								>
									<Paperclip className="h-5 w-5" />
								</ComposerPrimitive.AddAttachment>

								<ComposerPrimitive.Input
									placeholder="Type a message, or drag & drop files…"
									rows={1}
									className="flex-1 max-h-36 resize-none bg-transparent px-2 py-3.5 outline-none text-zinc-100 placeholder-zinc-600 text-sm leading-relaxed"
								/>

								<div className="flex items-center gap-1 mb-1 mr-1">
									<ComposerPrimitive.Cancel className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all hover:bg-zinc-800 hover:text-red-400 active:scale-95">
										<Trash2 className="h-4 w-4" />
									</ComposerPrimitive.Cancel>
									<ComposerPrimitive.Send asChild>
										<button
											type="submit"
											className="flex h-10 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
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

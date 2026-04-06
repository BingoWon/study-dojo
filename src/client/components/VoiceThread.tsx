import {
	AuiIf,
	MessagePrimitive,
	ThreadPrimitive,
	useAuiState,
	useVoiceControls,
	useVoiceState,
} from "@assistant-ui/react";
import { ArrowDown, X } from "lucide-react";
import { type FC, useEffect, useRef } from "react";
import { PERSONAS } from "../../worker/model";
import { usePersona } from "../RuntimeProvider";
import { TooltipIconButton } from "./ui/tooltip-icon-button";
import { VoiceControlCenter } from "./voice/VoiceOrb";

// ── VoiceThread ─────────────────────────────────────────────────────────────

export const VoiceThread: FC<{
	docTitle: string;
	onExit: () => void;
}> = ({ docTitle, onExit }) => {
	const { persona } = usePersona();
	const p = PERSONAS[persona];

	return (
		<ThreadPrimitive.Root
			className="flex h-full flex-col text-sm"
			style={{ "--thread-max-width": "44rem" } as React.CSSProperties}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-divider dark:border-divider-dark shrink-0">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-lg">{p.emoji}</span>
					<div className="min-w-0">
						<div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
							{p.name} · 语音陪读
						</div>
						<div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
							{docTitle}
						</div>
					</div>
				</div>
				<button
					type="button"
					onClick={onExit}
					className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
					title="退出语音模式"
				>
					<X className="w-4 h-4" />
				</button>
			</div>

			<ThreadPrimitive.Viewport className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth px-4 pt-4">
				{/* Welcome + auto-connect */}
				<AuiIf condition={(s) => s.thread.isEmpty}>
					<VoiceWelcome docTitle={docTitle} />
				</AuiIf>

				<AutoConnect onDisconnect={onExit} />

				<ThreadPrimitive.Messages>
					{() => <ThreadMessage />}
				</ThreadPrimitive.Messages>

				<ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto mt-auto flex w-full max-w-[var(--thread-max-width)] flex-col items-center pt-4 pb-6 bg-gradient-to-t from-white via-white/90 dark:from-zinc-900 dark:via-zinc-900/90 to-transparent rounded-t-3xl">
					<ThreadScrollToBottom />
					<VoiceControlCenter variant="violet" />
				</ThreadPrimitive.ViewportFooter>
			</ThreadPrimitive.Viewport>
		</ThreadPrimitive.Root>
	);
};

// ── Auto-connect on mount (once only) ───────────────────────────────────────

const AutoConnect: FC<{ onDisconnect: () => void }> = ({ onDisconnect }) => {
	const controls = useVoiceControls();
	const voiceState = useVoiceState();
	const didConnect = useRef(false);

	// Connect once on mount
	useEffect(() => {
		if (!didConnect.current && !voiceState && controls) {
			didConnect.current = true;
			controls.connect();
		}
	}, [voiceState, controls]);

	// Exit voice mode when session ends
	const status = voiceState?.status;
	useEffect(() => {
		if (didConnect.current && status?.type === "ended") {
			if (status.reason === "error") console.warn("[Voice] 连接异常断开");
			onDisconnect();
		}
	}, [status, onDisconnect]);

	return null;
};

// ── Welcome ─────────────────────────────────────────────────────────────────

const VoiceWelcome: FC<{ docTitle: string }> = ({ docTitle }) => {
	const { persona } = usePersona();
	const p = PERSONAS[persona];
	return (
		<div className="mx-auto my-auto flex w-full max-w-sm flex-grow flex-col items-center justify-center gap-4 px-4 text-center">
			<div className="text-5xl">{p.emoji}</div>
			<div>
				<div className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
					{p.name}
				</div>
				<div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
					正在阅读「{docTitle}」
				</div>
			</div>
		</div>
	);
};

// ── Messages ────────────────────────────────────────────────────────────────

/** Strip ElevenLabs mood/action tags like [sigh], [scoff], [laughs] */
const CleanText: FC<{ text: string }> = ({ text }) => (
	<>{text.replace(/\[[\w\s]+\]/g, "").trim()}</>
);

const ThreadMessage: FC = () => {
	const role = useAuiState((s) => s.message.role);
	if (role === "user") return <UserMessage />;
	return <AssistantMessage />;
};

const AssistantMessage: FC = () => (
	<MessagePrimitive.Root
		className="relative mx-auto w-full max-w-[var(--thread-max-width)] py-3 fade-in slide-in-from-bottom-1 animate-in duration-150"
		data-role="assistant"
	>
		<div className="break-words px-2 leading-relaxed text-zinc-900 dark:text-zinc-100">
			<MessagePrimitive.Parts components={{ Text: CleanText }} />
		</div>
	</MessagePrimitive.Root>
);

const UserMessage: FC = () => (
	<MessagePrimitive.Root
		className="mx-auto flex w-full max-w-[var(--thread-max-width)] justify-end px-2 py-3 fade-in slide-in-from-bottom-1 animate-in duration-150"
		data-role="user"
	>
		<div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 break-words text-zinc-900 dark:text-zinc-100">
			<MessagePrimitive.Parts components={{ Text: CleanText }} />
		</div>
	</MessagePrimitive.Root>
);

// ── Scroll to Bottom ────────────────────────────────────────────────────────

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

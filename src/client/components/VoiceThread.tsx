import {
	AuiIf,
	MessagePrimitive,
	ThreadPrimitive,
	useAuiState,
	useVoiceControls,
	useVoiceState,
	useVoiceVolume,
} from "@assistant-ui/react";
import { ArrowDown, Mic, MicOff, PhoneOff, X } from "lucide-react";
import type { FC } from "react";
import type { PersonaId } from "../../worker/model";
import { usePersona } from "../RuntimeProvider";
import { MarkdownText } from "./ui/markdown-text";
import { TooltipIconButton } from "./ui/tooltip-icon-button";

const PERSONA_CARDS: Record<
	PersonaId,
	{ emoji: string; name: string; color: string }
> = {
	blank_f: { emoji: "🌸", name: "温柔学姐", color: "#ec4899" },
	blank_m: { emoji: "📐", name: "学术老哥", color: "#0ea5e9" },
	professor: { emoji: "⚡", name: "暴躁教授", color: "#a855f7" },
	keli: { emoji: "💥", name: "可莉教授", color: "#ef4444" },
};

// ── VoiceThread ─────────────────────────────────────────────────────────────

export const VoiceThread: FC<{
	docTitle: string;
	onExit: () => void;
}> = ({ docTitle, onExit }) => {
	const { persona } = usePersona();
	const card = PERSONA_CARDS[persona];

	return (
		<ThreadPrimitive.Root
			className="flex h-full flex-col text-sm"
			style={{ "--thread-max-width": "44rem" } as React.CSSProperties}
		>
			{/* Header bar */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-divider dark:border-divider-dark shrink-0">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-lg">{card.emoji}</span>
					<div className="min-w-0">
						<div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
							{card.name} · 语音陪读
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
				<AuiIf condition={(s) => s.thread.isEmpty}>
					<VoiceWelcome persona={persona} docTitle={docTitle} />
				</AuiIf>

				<ThreadPrimitive.Messages>
					{() => <ThreadMessage />}
				</ThreadPrimitive.Messages>

				<ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto mt-auto flex w-full max-w-[var(--thread-max-width)] flex-col items-center pt-4 pb-6 bg-gradient-to-t from-white via-white/90 dark:from-zinc-900 dark:via-zinc-900/90 to-transparent rounded-t-3xl">
					<ThreadScrollToBottom />
					<VoiceControlCenter color={card.color} />
				</ThreadPrimitive.ViewportFooter>
			</ThreadPrimitive.Viewport>
		</ThreadPrimitive.Root>
	);
};

// ── Welcome ─────────────────────────────────────────────────────────────────

const VoiceWelcome: FC<{ persona: PersonaId; docTitle: string }> = ({
	persona,
	docTitle,
}) => {
	const card = PERSONA_CARDS[persona];
	return (
		<div className="mx-auto my-auto flex w-full max-w-sm flex-grow flex-col items-center justify-center gap-4 px-4 text-center">
			<div className="text-5xl">{card.emoji}</div>
			<div>
				<div className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
					{card.name}
				</div>
				<div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
					正在阅读「{docTitle}」
				</div>
			</div>
			<p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
				语音连接中，开始和导师讨论这篇文档吧
			</p>
		</div>
	);
};

// ── Controls ────────────────────────────────────────────────────────────────

const VoiceControlCenter: FC<{ color: string }> = ({ color }) => (
	<div className="flex flex-col items-center gap-4">
		<VoicePulse color={color} />
		<VoiceWaveform />

		<div className="flex items-center gap-3">
			{/* Idle / Ended → auto-connects, show nothing or "connecting" */}
			<AuiIf condition={(s) => s.thread.voice?.status.type === "starting"}>
				<span className="text-xs text-zinc-400 dark:text-zinc-500 animate-pulse">
					连接中...
				</span>
			</AuiIf>

			<AuiIf condition={(s) => s.thread.voice?.status.type === "running"}>
				<MuteButton />
				<DisconnectButton />
			</AuiIf>

			{/* Reconnect after disconnect */}
			<AuiIf
				condition={(s) =>
					s.thread.voice != null && s.thread.voice.status.type === "ended"
				}
			>
				<ConnectButton />
			</AuiIf>
		</div>
	</div>
);

// ── Pulse indicator (replaces WebGL orb with pure CSS) ──────────────────────

const VoicePulse: FC<{ color: string }> = ({ color }) => {
	const voiceState = useVoiceState();
	const volume = useVoiceVolume();
	const isActive = voiceState?.status.type === "running" && !voiceState.isMuted;
	const scale = isActive ? 1 + volume * 0.4 : 1;

	return (
		<div className="relative flex items-center justify-center w-20 h-20">
			{/* Glow ring */}
			<div
				className="absolute inset-0 rounded-full opacity-20 transition-transform duration-150"
				style={{
					background: color,
					transform: `scale(${scale * 1.15})`,
					filter: "blur(12px)",
				}}
			/>
			{/* Core circle */}
			<div
				className="relative w-16 h-16 rounded-full flex items-center justify-center transition-transform duration-150"
				style={{
					background: `radial-gradient(circle at 35% 35%, ${color}66, ${color})`,
					transform: `scale(${scale})`,
					boxShadow: `0 0 24px ${color}40`,
				}}
			>
				<Mic className="w-6 h-6 text-white" />
			</div>
		</div>
	);
};

// ── Waveform ────────────────────────────────────────────────────────────────

const BAR_WEIGHTS = [0.4, 0.65, 0.85, 1.0, 0.9, 0.75, 0.5];

const VoiceWaveform: FC = () => {
	const voiceState = useVoiceState();
	const volume = useVoiceVolume();
	const isActive = voiceState?.status.type === "running" && !voiceState.isMuted;

	return (
		<div className="flex h-6 items-center justify-center gap-[3px]">
			{BAR_WEIGHTS.map((weight, i) => {
				const s = isActive ? 0.1 + volume * 0.9 * weight : 0.1;
				return (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed bar order
						key={i}
						className="h-full w-[3px] origin-center rounded-full bg-zinc-400/50 dark:bg-zinc-500/50 transition-transform duration-100"
						style={{ transform: `scaleY(${s})` }}
					/>
				);
			})}
		</div>
	);
};

// ── Buttons ─────────────────────────────────────────────────────────────────

const ConnectButton: FC = () => {
	const controls = useVoiceControls();
	if (!controls) return null;
	return (
		<button
			type="button"
			onClick={controls.connect}
			className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium transition hover:opacity-90 cursor-pointer"
		>
			<Mic className="w-3.5 h-3.5" />
			重新连接
		</button>
	);
};

const MuteButton: FC = () => {
	const voiceState = useVoiceState();
	const controls = useVoiceControls();
	if (!controls || !voiceState) return null;
	const muted = voiceState.isMuted;

	return (
		<button
			type="button"
			onClick={muted ? controls.unmute : controls.mute}
			className={`p-3 rounded-full transition cursor-pointer ${
				muted
					? "bg-red-100 dark:bg-red-900/30 text-red-500"
					: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
			}`}
			title={muted ? "取消静音" : "静音"}
		>
			{muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
		</button>
	);
};

const DisconnectButton: FC = () => {
	const controls = useVoiceControls();
	if (!controls) return null;
	return (
		<button
			type="button"
			onClick={controls.disconnect}
			className="p-3 rounded-full bg-red-500 text-white transition hover:bg-red-600 cursor-pointer"
			title="结束通话"
		>
			<PhoneOff className="w-5 h-5" />
		</button>
	);
};

// ── Messages ────────────────────────────────────────────────────────────────

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
			<MessagePrimitive.Parts components={{ Text: MarkdownText }} />
		</div>
	</MessagePrimitive.Root>
);

const UserMessage: FC = () => (
	<MessagePrimitive.Root
		className="mx-auto flex w-full max-w-[var(--thread-max-width)] justify-end px-2 py-3 fade-in slide-in-from-bottom-1 animate-in duration-150"
		data-role="user"
	>
		<div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 break-words text-zinc-900 dark:text-zinc-100">
			<MessagePrimitive.Parts />
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

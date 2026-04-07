import { ArrowDown, Mic, MicOff, PhoneOff, X } from "lucide-react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { PERSONAS } from "../../worker/model";
import type {
	VoiceStatus,
	VoiceTranscript,
} from "../lib/elevenlabs-voice-adapter";
import { startVoiceSession } from "../lib/elevenlabs-voice-adapter";
import { getNextGreeting } from "../lib/greeting";
import { usePersona } from "../RuntimeProvider";
import { CharacterAvatar } from "./CharacterAvatar";
import { VoiceOrb, type VoiceOrbState } from "./voice/VoiceOrb";

// ── Helpers ─────────────────────────────────────────────────────────────────

function deriveOrbState(
	status: VoiceStatus,
	muted: boolean,
	mode: "listening" | "speaking",
): VoiceOrbState {
	if (status === "connecting") return "connecting";
	if (status !== "running") return "idle";
	if (muted) return "muted";
	return mode;
}

// ── VoiceThread ─────────────────────────────────────────────────────────────

export const VoiceThread: FC<{
	docTitle: string;
	systemPrompt: string;
	onExit: (voiceMessages?: VoiceTranscript[]) => void;
}> = ({ docTitle, systemPrompt, onExit }) => {
	const { persona } = usePersona();
	const p = PERSONAS[persona];

	const [status, setStatus] = useState<VoiceStatus>("idle");
	// Messages + an optional buffered AI response waiting for the next user msg.
	// Buffer is stored IN state (not ref) to survive React StrictMode double-render.
	const [msgState, setMsgState] = useState<{
		msgs: VoiceTranscript[];
		pendingAI: VoiceTranscript | null;
	}>({ msgs: [], pendingAI: null });
	const messages = msgState.msgs;
	const [mode, setMode] = useState<"listening" | "speaking">("listening");
	const [volume, setVolume] = useState(0);
	const [muted, setMuted] = useState(false);
	const controlsRef = useRef<{
		disconnect: () => void;
		mute: () => void;
		unmute: () => void;
	} | null>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const messagesRef = useRef(messages);
	messagesRef.current = messages;

	// Auto-scroll
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll trigger
	useEffect(() => {
		viewportRef.current?.scrollTo({
			top: viewportRef.current.scrollHeight,
			behavior: "smooth",
		});
	}, [messages.length]);

	// Auto-connect on mount
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-only
	useEffect(() => {
		let cancelled = false;

		const firstMessage = getNextGreeting(persona, "voice");

		const sessionPromise = startVoiceSession(
			"/api/voice-signed-url",
			{
				systemPrompt,
				firstMessage,
				voiceId: p.voiceId,
				voiceSpeed: p.voiceSpeed,
				voiceStability: p.voiceStability,
			},
			{
				onStatusChange: (s) => !cancelled && setStatus(s),
				onTranscript: (item) => {
					if (cancelled) return;
					setMsgState((prev) => {
						if (item.role === "assistant") {
							if (prev.msgs.length === 0) {
								return { msgs: [item], pendingAI: null };
							}
							return { ...prev, pendingAI: item };
						}
						if (prev.pendingAI) {
							return {
								msgs: [...prev.msgs, item, prev.pendingAI],
								pendingAI: null,
							};
						}
						return { msgs: [...prev.msgs, item], pendingAI: null };
					});
				},
				onModeChange: (m) => !cancelled && setMode(m),
				onVolumeChange: (v) => !cancelled && setVolume(v),
			},
		);

		sessionPromise.then((controls) => {
			if (cancelled) {
				controls.disconnect();
			} else {
				controlsRef.current = controls;
			}
		});

		return () => {
			cancelled = true;
			// Ensure cleanup even if session is still connecting
			sessionPromise.then((c) => c.disconnect());
		};
	}, []);

	const handleExit = useCallback(() => {
		controlsRef.current?.disconnect();
		onExit(messagesRef.current);
	}, [onExit]);

	const toggleMute = useCallback(() => {
		if (muted) controlsRef.current?.unmute();
		else controlsRef.current?.mute();
		setMuted((v) => !v);
	}, [muted]);

	const orbState = deriveOrbState(status, muted, mode);

	return (
		<div className="flex h-full flex-col text-sm">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-divider dark:border-divider-dark shrink-0">
				<div className="flex items-center gap-2 min-w-0">
					<CharacterAvatar persona={persona} size="sm" />
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
					onClick={handleExit}
					className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
					title="退出语音模式"
				>
					<X className="w-4 h-4" />
				</button>
			</div>

			{/* Messages */}
			<div ref={viewportRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
				{messages.length === 0 && (
					<div className="flex flex-col items-center justify-center h-full gap-2 text-center">
						<CharacterAvatar persona={persona} size="xl" />
						<div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
							{p.name}
						</div>
						<div className="text-xs text-zinc-400 dark:text-zinc-500">
							正在阅读「{docTitle}」
						</div>
					</div>
				)}

				{messages.map((msg, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: sequential
						key={i}
						className={`mb-3 max-w-[85%] ${msg.role === "user" ? "ml-auto" : "mr-auto"}`}
					>
						<div
							className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
								msg.role === "user"
									? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
									: "text-zinc-900 dark:text-zinc-100"
							}`}
						>
							{msg.text}
						</div>
					</div>
				))}
			</div>

			{/* Controls */}
			<div className="flex flex-col items-center gap-3 py-4 border-t border-divider dark:border-divider-dark">
				<VoiceOrb
					state={orbState}
					volume={volume}
					accentColor={p.accentColor}
					className="size-20"
				/>

				{/* Waveform bars */}
				<div className="flex h-6 items-center justify-center gap-[3px]">
					{[0.4, 0.65, 0.85, 1, 0.9, 0.75, 0.5].map((w, i) => {
						const s =
							orbState === "listening" || orbState === "speaking"
								? 0.1 + volume * 0.9 * w
								: 0.1;
						return (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed
								key={i}
								className="h-full w-[3px] origin-center rounded-full bg-zinc-400/50 dark:bg-zinc-500/50 transition-transform duration-100"
								style={{ transform: `scaleY(${s})` }}
							/>
						);
					})}
				</div>

				<div className="flex items-center gap-3">
					{(status === "idle" || status === "connecting") && (
						<span className="text-xs text-zinc-400 animate-pulse">
							连接中...
						</span>
					)}
					{status === "error" && (
						<span className="text-xs text-red-500">连接失败</span>
					)}
					{status === "running" && (
						<>
							<button
								type="button"
								onClick={toggleMute}
								className={`p-2.5 rounded-full transition cursor-pointer ${
									muted
										? "bg-red-100 dark:bg-red-900/30 text-red-500"
										: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
								}`}
								title={muted ? "取消静音" : "静音"}
							>
								{muted ? (
									<MicOff className="w-4 h-4" />
								) : (
									<Mic className="w-4 h-4" />
								)}
							</button>
							<button
								type="button"
								onClick={handleExit}
								className="p-2.5 rounded-full bg-red-500 text-white transition hover:bg-red-600 cursor-pointer"
								title="结束通话"
							>
								<PhoneOff className="w-4 h-4" />
							</button>
						</>
					)}
					{status === "ended" && (
						<button
							type="button"
							onClick={() => onExit(messagesRef.current)}
							className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium cursor-pointer"
						>
							<ArrowDown className="w-3.5 h-3.5" />
							返回文字对话
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

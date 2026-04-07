import { experimental_useObject as useObject } from "@ai-sdk/react";
import { useAui } from "@assistant-ui/react";
import { Mic, Send, Volume2, VolumeOff, X } from "lucide-react";
import {
	type FC,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { buildDialogueTurnSchema } from "../../shared/dialogue";
import type { PersonaId } from "../../worker/model";
import { getPoses, PERSONA_IDS, PERSONAS } from "../../worker/model";
import { CharacterAvatar } from "../components/CharacterAvatar";
import { SpeechActionBar } from "../components/SpeechActionBar";
import { useTypewriter } from "../hooks/useTypewriter";
import {
	createDialogueTTSPlayer,
	type StreamingTTSPlayer,
	ttsAdapter,
} from "../lib/dialogue-tts";
import { buildChatSummary, getActiveDocId } from "../lib/doc-context";
import { triggerEffect } from "../lib/effects";
import { ElevenLabsScribeAdapter } from "../lib/elevenlabs-scribe-adapter";
import { getNextPlaceholder } from "../lib/greeting";
import {
	persistDialogueTurn,
	setThreadPersona,
	useAutoTTS,
	usePersona,
} from "../RuntimeProvider";

// ── Voice input adapter (dialogue mode instance) ───────────────────────────

const scribeAdapter = new ElevenLabsScribeAdapter({
	tokenEndpoint: "/api/scribe-token",
	languageCode: "zh",
	toSimplified: true,
});

// ── Types ──────────────────────────────────────────────────────────────────

interface CompletedTurn {
	role: "assistant" | "user";
	pose?: string;
	speech: string;
}

type DisplayMode = "pose" | "avatar";

// ── Choice Button ──────────────────────────────────────────────────────────

const ChoiceButton: FC<{
	text: string;
	index: number;
	onClick: () => void;
	disabled: boolean;
}> = ({ text, index, onClick, disabled }) => (
	<button
		type="button"
		onClick={onClick}
		disabled={disabled}
		className="w-full text-left px-3 py-2 rounded-xl text-sm leading-relaxed
			bg-white/30 dark:bg-white/5
			border border-white/40 dark:border-white/10
			hover:bg-white/50 dark:hover:bg-white/10
			disabled:opacity-40 disabled:pointer-events-none
			transition-all duration-200 cursor-pointer group"
	>
		<span className="inline-flex items-center gap-2">
			<span className="shrink-0 w-5 h-5 rounded-full bg-white/40 dark:bg-white/10 text-[10px] font-bold flex items-center justify-center text-zinc-600 dark:text-zinc-300 group-hover:bg-white/60 dark:group-hover:bg-white/20 transition-colors">
				{index + 1}
			</span>
			<span className="text-zinc-700 dark:text-zinc-200">{text}</span>
		</span>
	</button>
);

// ── Main Component (bottom overlay) ────────────────────────────────────────

export const DialogueThread: FC<{
	persona: PersonaId;
	onExit: () => void;
}> = ({ persona, onExit }) => {
	const p = PERSONAS[persona];
	const { setPersona } = usePersona();

	const [turns, setTurns] = useState<CompletedTurn[]>([]);
	const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
		try {
			return (
				(localStorage.getItem("dialogue:displayMode") as DisplayMode) || "pose"
			);
		} catch {
			return "pose";
		}
	});
	const { autoTTS, setAutoTTS } = useAutoTTS();
	const [customInput, setCustomInput] = useState("");
	const [isDictating, setIsDictating] = useState(false);
	const [isSpeaking, setIsSpeaking] = useState(false);
	const dictationRef = useRef<{ stop: () => void; cancel: () => void } | null>(
		null,
	);
	const ttsRef = useRef<StreamingTTSPlayer | null>(null);

	// Context passed to /api/dialogue on every request
	const aui = useAui();
	const getContext = useCallback(() => {
		const activeDocId = getActiveDocId();
		const chatSummary =
			buildChatSummary(aui.thread().getState().messages) || undefined;
		return { activeDocId, chatSummary };
	}, [aui]);

	useEffect(() => {
		try {
			localStorage.setItem("dialogue:displayMode", displayMode);
		} catch {}
	}, [displayMode]);

	// Sync TTS voice params when persona changes (side effect, not in render)
	useEffect(() => {
		ttsAdapter.voiceId = p.voiceId;
		ttsAdapter.voiceSpeed = p.voiceSpeed;
		ttsAdapter.voiceStability = p.voiceStability;
	}, [p.voiceId, p.voiceSpeed, p.voiceStability]);

	const poses = useMemo(() => getPoses(persona), [persona]);
	const schema = useMemo(
		() => buildDialogueTurnSchema(poses as [string, ...string[]]),
		[poses],
	);

	// Cycling placeholder (stable per persona, shared with text mode)
	const inputPlaceholder = useMemo(
		() => getNextPlaceholder(persona),
		[persona],
	);

	const { object, submit, isLoading, error } = useObject({
		api: "/api/dialogue",
		schema,
		headers: {
			"x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
		},
	});

	const lastPoseRef = useRef("neutral");
	// Only update pose when it's a valid known pose (streaming may yield partial strings like "im")
	if (object?.pose && poses.includes(object.pose)) {
		lastPoseRef.current = object.pose;
	}
	const currentPose = lastPoseRef.current;

	// Track whether we're waiting for a new LLM response (user just sent, no streaming yet)
	const isWaiting = isLoading && !object?.speech;

	// Speech to display: streaming text when available, otherwise last completed assistant turn
	const streamingSpeech = object?.speech ?? "";
	const lastCompletedSpeech =
		turns.filter((t) => t.role === "assistant").pop()?.speech ?? "";
	// When waiting for response, show nothing (the UI will show loading dots)
	const currentSpeech = isWaiting ? "" : streamingSpeech || lastCompletedSpeech;

	const currentChoices = object?.choices;
	const hasChoices =
		currentChoices && currentChoices.length > 0 && currentChoices[0] != null;
	const displayedSpeech = useTypewriter(
		currentSpeech,
		isLoading && !isWaiting,
		25,
	);

	// ── Actions ──

	const sendTurn = useCallback(
		(userSpeech: string) => {
			ttsRef.current?.abort();
			ttsRef.current = null;
			const userTurn: CompletedTurn = { role: "user", speech: userSpeech };
			persistDialogueTurn({ role: "user", speech: userSpeech });
			const newTurns = [...turns, userTurn];
			setTurns(newTurns);
			submit({
				history: newTurns.map((t) => ({ role: t.role, speech: t.speech })),
				persona,
				...getContext(),
			});
		},
		[turns, persona, submit, getContext],
	);

	// Init + persona switch: inject system marker, auto-request LLM response
	const initPersonaRef = useRef<PersonaId | null>(null);
	const turnsRef = useRef(turns);
	turnsRef.current = turns;
	const submitRef = useRef(submit);
	submitRef.current = submit;
	const getContextRef = useRef(getContext);
	getContextRef.current = getContext;

	useEffect(() => {
		if (initPersonaRef.current === persona) return;
		const prevId = initPersonaRef.current;
		initPersonaRef.current = persona;

		// Abort any ongoing TTS
		ttsRef.current?.abort();
		ttsRef.current = null;

		// Build system marker + submit to LLM
		let newTurns: CompletedTurn[];
		if (prevId !== null) {
			// Persona switch
			const marker: CompletedTurn = {
				role: "user",
				speech: `[角色切换：${PERSONAS[prevId].name} → ${PERSONAS[persona].name}]`,
			};
			persistDialogueTurn(marker);
			newTurns = [...turnsRef.current, marker];
		} else {
			// Initial enter
			const marker: CompletedTurn = {
				role: "user",
				speech: "[进入剧情伴读]",
			};
			persistDialogueTurn(marker);
			newTurns = [marker];
		}
		setTurns(newTurns);

		// Auto-request LLM response (model generates its own opening)
		submitRef.current({
			history: newTurns.map((t) => ({ role: t.role, speech: t.speech })),
			persona,
			...getContextRef.current(),
		});
	}, [persona]);

	// ── TTS (only for real LLM streaming, not greeting fallback) ──

	useEffect(() => {
		if (!autoTTS || !streamingSpeech || isWaiting) return;
		if (!ttsRef.current && streamingSpeech.length > 0)
			ttsRef.current = createDialogueTTSPlayer();
		if (ttsRef.current && isLoading) ttsRef.current.feedText(streamingSpeech);
	}, [streamingSpeech, isLoading, autoTTS, isWaiting]);

	const wasLoadingRef = useRef(false);
	useEffect(() => {
		if (wasLoadingRef.current && !isLoading && object?.speech) {
			ttsRef.current?.flush(object.speech);
			triggerEffect(object.postEffect);
			const assistantSpeech = object.speech as string;
			persistDialogueTurn({ role: "assistant", speech: assistantSpeech });
			setTurns((prev) => [
				...prev,
				{
					role: "assistant",
					pose: (object.pose as string) ?? "neutral",
					speech: assistantSpeech,
				},
			]);
		}
		wasLoadingRef.current = isLoading;
	}, [isLoading, object]);

	const preEffectTriggered = useRef(false);
	useEffect(() => {
		if (isLoading && object?.preEffect && !preEffectTriggered.current) {
			triggerEffect(object.preEffect);
			preEffectTriggered.current = true;
		}
		if (!isLoading) preEffectTriggered.current = false;
	}, [isLoading, object?.preEffect]);

	const handleChoice = useCallback(
		(choice: string) => sendTurn(choice),
		[sendTurn],
	);

	const handleCustomSubmit = useCallback(() => {
		const text = customInput.trim();
		if (!text || isLoading) return;
		setCustomInput("");
		sendTurn(text);
	}, [customInput, isLoading, sendTurn]);

	const handleExit = useCallback(() => {
		ttsRef.current?.abort();
		dictationRef.current?.cancel();
		onExit();
	}, [onExit]);

	const handleManualSpeak = useCallback(() => {
		ttsRef.current?.abort();
		if (!currentSpeech) return;
		const player = createDialogueTTSPlayer();
		ttsRef.current = player;
		setIsSpeaking(true);
		player.flush(currentSpeech);
	}, [currentSpeech]);

	const handleStopSpeak = useCallback(() => {
		ttsRef.current?.abort();
		ttsRef.current = null;
		setIsSpeaking(false);
	}, []);

	// ── Dictation ──

	const startDictation = useCallback(() => {
		if (isDictating || isLoading) return;
		ttsRef.current?.abort();
		setIsDictating(true);
		const session = scribeAdapter.listen();
		dictationRef.current = session;
		session.onSpeech((result) => setCustomInput(result.transcript));
		session.onSpeechEnd((result) => {
			setIsDictating(false);
			dictationRef.current = null;
			if (result.transcript.trim()) {
				sendTurn(result.transcript.trim());
				setCustomInput("");
			}
		});
	}, [isDictating, isLoading, sendTurn]);

	const stopDictation = useCallback(() => {
		dictationRef.current?.stop();
		setIsDictating(false);
		dictationRef.current = null;
	}, []);

	// ── Shared dialogue panel (glass card with all controls) ──

	const dialoguePanel = (
		<div className="dialogue-glass rounded-3xl p-4 space-y-3 relative">
			{/* Top row: name + persona switcher + close */}
			<div
				className={`flex items-center justify-between ${displayMode === "avatar" ? "pl-[96px]" : ""}`}
			>
				<div className="flex items-center gap-2.5">
					<div>
						<span className="font-genshin text-lg text-zinc-900 dark:text-zinc-50 tracking-wide">
							{p.name}
						</span>
						<span className="ml-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
							{p.title}
						</span>
					</div>
				</div>

				{/* Persona switcher + close */}
				<div className="flex items-center gap-1">
					<span className="text-[10px] text-zinc-400 dark:text-zinc-500 mr-0.5">
						切换角色：
					</span>
					{PERSONA_IDS.map((id) => (
						<button
							key={id}
							type="button"
							onClick={() => {
								setPersona(id);
								// Update thread persona mapping + persist to DB
								const remoteId =
									window.location.pathname.match(/\/c\/([0-9a-f-]{36})/)?.[1];
								if (remoteId) {
									setThreadPersona(remoteId, id);
									fetch(`/api/threads/${remoteId}`, {
										method: "PATCH",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({ persona: id }),
									}).catch((e) =>
										console.error("[dialogue] Persona update failed:", e),
									);
								}
							}}
							className={`rounded-full transition-all cursor-pointer ${
								id === persona
									? "ring-2 ring-purple-400 dark:ring-purple-500 scale-110"
									: "opacity-50 hover:opacity-100 hover:scale-105"
							}`}
							title={PERSONAS[id].name}
						>
							<CharacterAvatar persona={id} size="xs" />
						</button>
					))}
					<button
						type="button"
						onClick={handleExit}
						className="ml-1 p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-white/30 dark:hover:bg-white/10 transition-colors cursor-pointer"
						title="退出剧情模式"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Error */}
			{error && (
				<div className="px-3 py-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-xs">
					{error.message}
				</div>
			)}

			{/* Speech bubble */}
			<div className="rounded-xl px-4 py-3 text-sm leading-relaxed bg-white/30 dark:bg-white/5 text-zinc-800 dark:text-zinc-200">
				{isWaiting ? (
					<span className="text-zinc-400 dark:text-zinc-500 animate-pulse">
						......
					</span>
				) : (
					<>
						{displayedSpeech || (
							<span className="text-zinc-400 dark:text-zinc-500 animate-pulse">
								......
							</span>
						)}
						{isLoading && displayedSpeech && (
							<span className="inline-block w-0.5 h-4 bg-zinc-400 dark:bg-zinc-500 animate-pulse ml-0.5 align-text-bottom" />
						)}
					</>
				)}
			</div>

			{/* Action bar: speak + copy (aligned with bubble text via px-4) */}
			{!isWaiting && !isLoading && currentSpeech && (
				<SpeechActionBar
					text={currentSpeech}
					onSpeak={handleManualSpeak}
					isSpeaking={isSpeaking}
					onStopSpeak={handleStopSpeak}
					className="px-3"
				/>
			)}

			{/* Choices */}
			{!isLoading && hasChoices && (
				<div className="space-y-1.5">
					{currentChoices?.map(
						(c, i) =>
							c && (
								<ChoiceButton
									key={c}
									text={c}
									index={i}
									onClick={() => handleChoice(c)}
									disabled={isLoading}
								/>
							),
					)}
				</div>
			)}

			{/* Input row */}
			<div className="flex items-center gap-2">
				{/* Display mode: pill segmented control */}
				<div className="shrink-0 flex items-center rounded-full bg-white/30 dark:bg-white/10 p-0.5">
					<button
						type="button"
						onClick={() => setDisplayMode("pose")}
						className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
							displayMode === "pose"
								? "bg-white/70 dark:bg-white/20 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
						}`}
					>
						姿态
					</button>
					<button
						type="button"
						onClick={() => setDisplayMode("avatar")}
						className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
							displayMode === "avatar"
								? "bg-white/70 dark:bg-white/20 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
						}`}
					>
						头像
					</button>
				</div>

				{/* Auto TTS toggle */}
				<button
					type="button"
					onClick={() => setAutoTTS(!autoTTS)}
					className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
						autoTTS
							? "bg-purple-500/20 text-purple-500"
							: "bg-white/30 dark:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
					}`}
					title={autoTTS ? "关闭自动朗读" : "开启自动朗读"}
				>
					{autoTTS ? (
						<Volume2 className="w-3.5 h-3.5" />
					) : (
						<VolumeOff className="w-3.5 h-3.5" />
					)}
				</button>

				{/* Input field with mic inside */}
				<div className="flex-1 flex items-center rounded-full bg-white/40 dark:bg-white/10 border border-white/50 dark:border-white/15 focus-within:ring-2 focus-within:ring-purple-500/30 transition-all overflow-hidden">
					<input
						type="text"
						value={customInput}
						onChange={(e) => setCustomInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								handleCustomSubmit();
							}
						}}
						placeholder={isDictating ? "正在听..." : inputPlaceholder}
						disabled={isDictating}
						className="flex-1 px-4 py-2 text-sm bg-transparent outline-none
							text-zinc-800 dark:text-zinc-200
							placeholder:text-zinc-400 dark:placeholder:text-zinc-500
							disabled:opacity-50"
					/>
					<button
						type="button"
						onClick={isDictating ? stopDictation : startDictation}
						disabled={isLoading && !isDictating}
						className={`shrink-0 w-8 h-8 mr-1 rounded-full flex items-center justify-center transition-all cursor-pointer ${
							isDictating
								? "bg-red-500 text-white animate-pulse"
								: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-white/30 dark:hover:bg-white/10"
						} disabled:opacity-30 disabled:pointer-events-none`}
						title={isDictating ? "停止录音" : "语音输入"}
					>
						<Mic className="w-3.5 h-3.5" />
					</button>
				</div>

				{/* Send */}
				<button
					type="button"
					onClick={handleCustomSubmit}
					disabled={isLoading || isDictating || !customInput.trim()}
					className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center
						bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900
						hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none
						transition-opacity cursor-pointer"
					title="发送"
				>
					<Send className="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
	);

	// ── Render ──

	return (
		<div id="dialogue-overlay" className="relative">
			{displayMode === "pose" ? (
				// ── Pose Mode: pose+panel 3/4 width, centered at bottom ──
				<div className="flex justify-center pb-0">
					<div className="w-3/4 flex items-end">
						{/* Character pose: h=2/3 screen, max-w=40%, pointer-events-none so transparent area doesn't block content behind */}
						<div className="shrink-0 h-[66dvh] max-w-[40%] pointer-events-none">
							<PoseImage persona={persona} pose={currentPose} />
						</div>

						{/* Dialogue panel: fills remaining width, max-h=50vh */}
						<div className="flex-1 min-w-0 -ml-4 max-h-[50vh] overflow-y-auto pb-4 pointer-events-auto">
							{dialoguePanel}
						</div>
					</div>
				</div>
			) : (
				// ── Avatar Mode: centered, 60% width, avatar overflows top ──
				<div className="flex justify-center pb-4 px-4">
					<div className="relative w-3/5 min-w-[400px] pointer-events-auto">
						{/* Avatar: bottom aligns with name text baseline, top 1/3 overflows above panel */}
						<AvatarImage
							persona={persona}
							pose={currentPose}
							className="absolute left-2.5 z-20 w-[100px] h-[100px] object-cover drop-shadow-lg select-none"
							style={{ bottom: "calc(100% - 52px)" }}
						/>
						<div className="max-h-[50vh] overflow-y-auto">{dialoguePanel}</div>
					</div>
				</div>
			)}
		</div>
	);
};

// ── Pose Image ─────────────────────────────────────────────────────────────

/** Preload-then-swap avatar image (same pattern as PoseImage to prevent flicker). */
const AvatarImage: FC<{
	persona: PersonaId;
	pose: string;
	className?: string;
	style?: React.CSSProperties;
}> = ({ persona, pose, className, style }) => {
	const src = `/characters/${persona}/avatars/${pose}.webp`;
	const [loadedSrc, setLoadedSrc] = useState(src);

	useEffect(() => {
		if (src === loadedSrc) return;
		const img = new Image();
		img.onload = () => setLoadedSrc(src);
		img.src = src;
	}, [src, loadedSrc]);

	return (
		<img
			src={loadedSrc}
			alt={`${PERSONAS[persona].name} – ${pose}`}
			className={className}
			style={style}
			draggable={false}
		/>
	);
};

const PoseImage: FC<{
	persona: PersonaId;
	pose: string;
}> = ({ persona, pose }) => {
	const src = `/characters/${persona}/poses/${pose}.webp`;
	const [loadedSrc, setLoadedSrc] = useState(src);
	const [errSrc, setErrSrc] = useState("");

	// Preload new image, then swap (prevents flicker)
	useEffect(() => {
		if (src === loadedSrc || src === errSrc) return;
		const img = new Image();
		img.onload = () => setLoadedSrc(src);
		img.onerror = () => setErrSrc(src);
		img.src = src;
	}, [src, loadedSrc, errSrc]);

	if (errSrc === src) {
		return (
			<div className="w-full h-full flex items-end justify-center">
				<CharacterAvatar persona={persona} pose={pose} size="xl" />
			</div>
		);
	}

	return (
		<img
			src={loadedSrc}
			alt={`${PERSONAS[persona].name} – ${pose}`}
			className="w-full h-full object-contain object-bottom select-none drop-shadow-xl transition-opacity duration-300"
			draggable={false}
		/>
	);
};

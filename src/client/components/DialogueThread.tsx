import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Mic, Send, Volume2, VolumeOff, X } from "lucide-react";
import {
	type FC,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Effect } from "../../shared/dialogue";
import { buildDialogueTurnSchema } from "../../shared/dialogue";
import type { PersonaId } from "../../worker/model";
import { getPoses, PERSONAS } from "../../worker/model";
import { CharacterAvatar } from "../components/CharacterAvatar";
import { useTypewriter } from "../hooks/useTypewriter";
import { DialogueTTSPlayer, ttsAdapter } from "../lib/dialogue-tts";
import { ElevenLabsScribeAdapter } from "../lib/elevenlabs-scribe-adapter";
import { getNextGreeting, getNextPlaceholder } from "../lib/greeting";

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

// ── Visual Effects ─────────────────────────────────────────────────────────

function triggerEffect(effect: Effect | undefined) {
	if (!effect) return;
	const el = document.getElementById("dialogue-overlay");
	if (!el) return;
	switch (effect) {
		case "screen-shake":
			el.classList.add("animate-shake");
			setTimeout(() => el.classList.remove("animate-shake"), 500);
			break;
		case "flash":
			el.classList.add("animate-flash");
			setTimeout(() => el.classList.remove("animate-flash"), 300);
			break;
		case "confetti":
			spawnConfetti(el);
			break;
	}
}

function spawnConfetti(container: HTMLElement) {
	const colors = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#a855f7"];
	for (let i = 0; i < 30; i++) {
		const dot = document.createElement("div");
		dot.className = "confetti-particle";
		dot.style.cssText = `
			position:absolute;left:${50 + (Math.random() - 0.5) * 60}%;top:20%;
			width:8px;height:8px;border-radius:50%;
			background:${colors[i % colors.length]};
			animation:confetti-fall ${0.8 + Math.random() * 0.6}s ease-out forwards;
			pointer-events:none;z-index:50;
		`;
		container.appendChild(dot);
		setTimeout(() => dot.remove(), 1500);
	}
}

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
	const [autoTTS, setAutoTTS] = useState(() => {
		try {
			return localStorage.getItem("settings:autoTTS") !== "false";
		} catch {
			return true;
		}
	});
	const [customInput, setCustomInput] = useState("");
	const [isDictating, setIsDictating] = useState(false);
	const dictationRef = useRef<{ stop: () => void; cancel: () => void } | null>(
		null,
	);
	const ttsRef = useRef<DialogueTTSPlayer | null>(null);

	useEffect(() => {
		try {
			localStorage.setItem("dialogue:displayMode", displayMode);
		} catch {}
	}, [displayMode]);

	ttsAdapter.voiceId = p.voiceId;
	ttsAdapter.voiceSpeed = p.voiceSpeed;
	ttsAdapter.voiceStability = p.voiceStability;

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
	});

	const lastPoseRef = useRef("neutral");
	if (object?.pose) lastPoseRef.current = object.pose;
	const currentPose = lastPoseRef.current;
	const currentSpeech = object?.speech ?? "";
	const currentChoices = object?.choices;
	const hasChoices =
		currentChoices && currentChoices.length > 0 && currentChoices[0] != null;
	const displayedSpeech = useTypewriter(currentSpeech, isLoading, 25);

	// ── Actions ──

	const sendTurn = useCallback(
		(userSpeech: string) => {
			ttsRef.current?.abort();
			ttsRef.current = null;
			const userTurn: CompletedTurn = { role: "user", speech: userSpeech };
			const newTurns = [...turns, userTurn];
			setTurns(newTurns);
			submit({
				history: newTurns.map((t) => ({ role: t.role, speech: t.speech })),
				persona,
			});
		},
		[turns, persona, submit],
	);

	const mountedRef = useRef(false);
	useEffect(() => {
		if (mountedRef.current) return;
		mountedRef.current = true;
		const greeting = getNextGreeting(persona, "dialogue");
		lastPoseRef.current = greeting.pose;
		setTurns([
			{ role: "assistant", pose: greeting.pose, speech: greeting.text },
		]);
		submit({ history: [], persona });
	}, [submit, persona]);

	// ── TTS ──

	useEffect(() => {
		if (!autoTTS || !currentSpeech) return;
		if (!ttsRef.current && currentSpeech.length > 0)
			ttsRef.current = new DialogueTTSPlayer(ttsAdapter.voiceParams);
		if (ttsRef.current && isLoading) ttsRef.current.feedSpeech(currentSpeech);
	}, [currentSpeech, isLoading, autoTTS]);

	const wasLoadingRef = useRef(false);
	useEffect(() => {
		if (wasLoadingRef.current && !isLoading && object?.speech) {
			ttsRef.current?.flush(object.speech);
			triggerEffect(object.postEffect as Effect | undefined);
			setTurns((prev) => [
				...prev,
				{
					role: "assistant",
					pose: (object.pose as string) ?? "neutral",
					speech: object.speech as string,
				},
			]);
		}
		wasLoadingRef.current = isLoading;
	}, [isLoading, object]);

	const preEffectTriggered = useRef(false);
	useEffect(() => {
		if (isLoading && object?.preEffect && !preEffectTriggered.current) {
			triggerEffect(object.preEffect as Effect | undefined);
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
		const speech =
			currentSpeech ||
			turns.filter((t) => t.role === "assistant").pop()?.speech;
		if (!speech) return;
		const player = new DialogueTTSPlayer(ttsAdapter.voiceParams);
		ttsRef.current = player;
		player.flush(speech);
	}, [currentSpeech, turns]);

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
			{/* Close button */}
			<button
				type="button"
				onClick={handleExit}
				className="absolute top-3 right-3 p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-white/30 dark:hover:bg-white/10 transition-colors cursor-pointer z-20"
				title="退出剧情模式"
			>
				<X className="w-4 h-4" />
			</button>

			{/* Name + title (+ avatar in avatar mode) */}
			<div className="pr-8 flex items-center gap-2.5">
				{displayMode === "avatar" && (
					<CharacterAvatar
						persona={persona}
						pose={currentPose}
						size="md"
						className="ring-2 ring-white/40 dark:ring-white/10 shadow-md"
					/>
				)}
				<div>
					<span className="font-genshin text-lg text-zinc-900 dark:text-zinc-50 tracking-wide">
						{p.name}
					</span>
					<span className="ml-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
						{p.title}
					</span>
				</div>
			</div>

			{/* Error */}
			{error && (
				<div className="px-3 py-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-xs">
					{error.message}
				</div>
			)}

			{/* Speech */}
			<button
				type="button"
				className="w-full text-left rounded-xl px-4 py-3 text-sm leading-relaxed
					bg-white/30 dark:bg-white/5
					text-zinc-800 dark:text-zinc-200 cursor-pointer
					hover:bg-white/40 dark:hover:bg-white/10 transition-colors"
				onClick={handleManualSpeak}
				title="点击朗读"
			>
				{displayedSpeech || (
					<span className="text-zinc-400 dark:text-zinc-500 animate-pulse">
						......
					</span>
				)}
				{isLoading && displayedSpeech && (
					<span className="inline-block w-0.5 h-4 bg-zinc-400 dark:bg-zinc-500 animate-pulse ml-0.5 align-text-bottom" />
				)}
			</button>

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
					onClick={() => setAutoTTS((v) => !v)}
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
						disabled={isLoading || isDictating}
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
		<div id="dialogue-overlay" className="relative pointer-events-auto">
			{displayMode === "pose" ? (
				// ── Pose Mode: character left, glass panel right ──
				<div className="flex items-end">
					{/* Character pose: h=2/3 screen, max-w=1/3, flush left+bottom */}
					<div className="shrink-0 h-[66dvh] max-w-[33vw]">
						<PoseImage persona={persona} pose={currentPose} />
					</div>

					{/* Dialogue panel: max-h=50vh, right margin=33vw */}
					<div
						className="-ml-4 max-h-[50vh] overflow-y-auto pb-4"
						style={{ marginRight: "33vw" }}
					>
						{dialoguePanel}
					</div>
				</div>
			) : (
				// ── Avatar Mode: centered, 50% width, avatar inside panel ──
				<div className="flex justify-center pb-4 px-4">
					<div className="w-1/2 min-w-[360px] max-w-[600px] max-h-[50vh] overflow-y-auto">
						{dialoguePanel}
					</div>
				</div>
			)}
		</div>
	);
};

// ── Pose Image ─────────────────────────────────────────────────────────────

const PoseImage: FC<{
	persona: PersonaId;
	pose: string;
}> = ({ persona, pose }) => {
	const src = `/characters/${persona}/poses/${pose}.webp`;
	const [errSrc, setErrSrc] = useState("");
	const err = errSrc === src;

	if (err) {
		return (
			<div className="w-full h-full flex items-end justify-center">
				<CharacterAvatar persona={persona} pose={pose} size="xl" />
			</div>
		);
	}

	return (
		<img
			src={src}
			alt={`${PERSONAS[persona].name} – ${pose}`}
			className="w-full h-full object-contain object-bottom select-none drop-shadow-xl"
			draggable={false}
			onError={() => setErrSrc(src)}
		/>
	);
};

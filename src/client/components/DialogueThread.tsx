import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Send, Volume2, VolumeOff, X } from "lucide-react";
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
	const el = document.getElementById("dialogue-viewport");
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
			position:absolute;left:${50 + (Math.random() - 0.5) * 60}%;top:40%;
			width:8px;height:8px;border-radius:50%;
			background:${colors[i % colors.length]};
			animation:confetti-fall ${0.8 + Math.random() * 0.6}s ease-out forwards;
			pointer-events:none;z-index:50;
		`;
		container.appendChild(dot);
		setTimeout(() => dot.remove(), 1500);
	}
}

// ── Pose Image (full character, transparent bg, portrait orientation) ──────

const PoseImage: FC<{
	persona: PersonaId;
	pose: string;
}> = ({ persona, pose }) => {
	const src = `/characters/${persona}/poses/${pose}.webp`;
	const [errSrc, setErrSrc] = useState("");
	const err = errSrc === src;

	if (err) {
		return (
			<div className="w-full h-full flex items-center justify-center">
				<CharacterAvatar persona={persona} pose={pose} size="xl" />
			</div>
		);
	}

	return (
		<img
			src={src}
			alt={`${PERSONAS[persona].name} – ${pose}`}
			className="h-full w-auto max-w-full object-contain object-bottom select-none"
			draggable={false}
			onError={() => setErrSrc(src)}
		/>
	);
};

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
		className="w-full text-left px-4 py-3 rounded-xl text-sm leading-relaxed
			bg-white/60 dark:bg-zinc-800/60 backdrop-blur-sm
			border border-zinc-200/80 dark:border-zinc-700/60
			hover:bg-white dark:hover:bg-zinc-700/80
			hover:border-zinc-300 dark:hover:border-zinc-600
			hover:shadow-md
			disabled:opacity-40 disabled:pointer-events-none
			transition-all duration-200 cursor-pointer group"
	>
		<span className="inline-flex items-center gap-2">
			<span className="shrink-0 w-5 h-5 rounded-md bg-zinc-100 dark:bg-zinc-700 text-[10px] font-bold flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-600 transition-colors">
				{index + 1}
			</span>
			<span className="text-zinc-700 dark:text-zinc-200">{text}</span>
		</span>
	</button>
);

// ── Display Mode Toggle ────────────────────────────────────────────────────

const DisplayModeToggle: FC<{
	mode: DisplayMode;
	onChange: (m: DisplayMode) => void;
}> = ({ mode, onChange }) => (
	<div className="flex items-center rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
		<button
			type="button"
			onClick={() => onChange("pose")}
			className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
				mode === "pose"
					? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
					: "text-zinc-500 dark:text-zinc-400"
			}`}
		>
			姿态
		</button>
		<button
			type="button"
			onClick={() => onChange("avatar")}
			className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
				mode === "avatar"
					? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
					: "text-zinc-500 dark:text-zinc-400"
			}`}
		>
			头像
		</button>
	</div>
);

// ── Main Component ─────────────────────────────────────────────────────────

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
	const ttsRef = useRef<DialogueTTSPlayer | null>(null);

	// Persist display mode
	useEffect(() => {
		try {
			localStorage.setItem("dialogue:displayMode", displayMode);
		} catch {}
	}, [displayMode]);

	// Sync TTS voice to persona
	ttsAdapter.voiceId = p.voiceId;
	ttsAdapter.voiceSpeed = p.voiceSpeed;
	ttsAdapter.voiceStability = p.voiceStability;

	// Build schema from persona poses (computed client-side, no API call needed)
	const poses = useMemo(() => getPoses(persona), [persona]);
	const schema = useMemo(
		() => buildDialogueTurnSchema(poses as [string, ...string[]]),
		[poses],
	);

	const { object, submit, isLoading, error } = useObject({
		api: "/api/dialogue",
		schema,
	});

	const currentPose = object?.pose ?? "neutral";
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
			const history = newTurns.map((t) => ({
				role: t.role,
				speech: t.speech,
			}));
			submit({ history, persona });
		},
		[turns, persona, submit],
	);

	const mountedRef = useRef(false);
	useEffect(() => {
		if (mountedRef.current) return;
		mountedRef.current = true;
		submit({ history: [], persona });
	}, [submit, persona]);

	// ── TTS streaming ──

	useEffect(() => {
		if (!autoTTS || !currentSpeech) return;
		if (!ttsRef.current && currentSpeech.length > 0) {
			ttsRef.current = new DialogueTTSPlayer(ttsAdapter.voiceParams);
		}
		if (ttsRef.current && isLoading) {
			ttsRef.current.feedSpeech(currentSpeech);
		}
	}, [currentSpeech, isLoading, autoTTS]);

	const wasLoadingRef = useRef(false);
	useEffect(() => {
		if (wasLoadingRef.current && !isLoading && object?.speech) {
			ttsRef.current?.flush(object.speech);
			triggerEffect(object.postEffect as Effect | undefined);
			const turn: CompletedTurn = {
				role: "assistant",
				pose: (object.pose as string) ?? "neutral",
				speech: object.speech as string,
			};
			setTurns((prev) => [...prev, turn]);
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

	const showDialogueBox = isLoading || currentSpeech || turns.length > 0;

	// ── Render ──

	return (
		<div className="flex h-full flex-col text-sm">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-divider dark:border-divider-dark shrink-0">
				<div className="flex items-center gap-2 min-w-0">
					<CharacterAvatar persona={persona} size="sm" />
					<div className="min-w-0">
						<div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
							{p.name} · {p.title}
						</div>
						<div className="text-[10px] text-zinc-400 dark:text-zinc-500">
							剧情模式
						</div>
					</div>
				</div>
				<div className="flex items-center gap-1.5">
					<DisplayModeToggle mode={displayMode} onChange={setDisplayMode} />
					<button
						type="button"
						onClick={() => setAutoTTS((v) => !v)}
						className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
							autoTTS
								? "text-purple-500 bg-purple-50 dark:bg-purple-950/30"
								: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
						}`}
						title={autoTTS ? "关闭自动朗读" : "开启自动朗读"}
					>
						{autoTTS ? (
							<Volume2 className="w-4 h-4" />
						) : (
							<VolumeOff className="w-4 h-4" />
						)}
					</button>
					<button
						type="button"
						onClick={handleExit}
						className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
						title="退出剧情模式"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Viewport */}
			<div
				id="dialogue-viewport"
				className="flex-1 flex flex-col overflow-hidden relative"
			>
				{error && (
					<div className="mx-4 mt-4 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs">
						{error.message}
					</div>
				)}

				{showDialogueBox ? (
					displayMode === "pose" ? (
						<PoseLayout
							persona={persona}
							pose={currentPose}
							speech={displayedSpeech}
							isLoading={isLoading}
							hasChoices={!isLoading && !!hasChoices}
							choices={currentChoices}
							onChoice={handleChoice}
							onSpeak={handleManualSpeak}
							name={p.name}
							title={p.title}
						/>
					) : (
						<AvatarLayout
							persona={persona}
							pose={currentPose}
							speech={displayedSpeech}
							isLoading={isLoading}
							hasChoices={!isLoading && !!hasChoices}
							choices={currentChoices}
							onChoice={handleChoice}
							onSpeak={handleManualSpeak}
							name={p.name}
							title={p.title}
						/>
					)
				) : (
					<div className="flex flex-col items-center justify-center h-full gap-3 text-center">
						<CharacterAvatar persona={persona} size="xl" />
						<div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
							{p.name}
						</div>
						<div className="text-xs text-zinc-400 dark:text-zinc-500 animate-pulse">
							正在进入剧情模式...
						</div>
					</div>
				)}
			</div>

			{/* Input bar */}
			<div className="px-4 py-3 border-t border-divider dark:border-divider-dark shrink-0">
				<div className="flex items-center gap-2">
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
						placeholder="输入自定义回复..."
						disabled={isLoading}
						className="flex-1 px-4 py-2.5 rounded-xl text-sm
							bg-zinc-50 dark:bg-zinc-800/80
							border border-zinc-200 dark:border-zinc-700
							placeholder:text-zinc-400 dark:placeholder:text-zinc-500
							focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400
							disabled:opacity-50 transition-colors"
					/>
					<button
						type="button"
						onClick={handleCustomSubmit}
						disabled={isLoading || !customInput.trim()}
						className="p-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900
							hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none
							transition-opacity cursor-pointer"
						title="发送"
					>
						<Send className="w-4 h-4" />
					</button>
				</div>
			</div>
		</div>
	);
};

// ── Layout: Pose Mode (Hades 2 style — large character + bottom dialogue) ─

interface LayoutProps {
	persona: PersonaId;
	pose: string;
	speech: string;
	isLoading: boolean;
	hasChoices: boolean;
	choices: (string | undefined)[] | undefined;
	onChoice: (c: string) => void;
	onSpeak: () => void;
	name: string;
	title: string;
}

const PoseLayout: FC<LayoutProps> = ({
	persona,
	pose,
	speech,
	isLoading,
	hasChoices,
	choices,
	onChoice,
	onSpeak,
	name,
	title,
}) => (
	<div className="flex-1 flex flex-col overflow-hidden">
		{/* Character pose area — fills available space */}
		<div className="flex-1 flex items-end justify-center overflow-hidden px-4 pt-2">
			<PoseImage persona={persona} pose={pose} />
		</div>

		{/* Dialogue box — fixed at bottom, overlaps character slightly */}
		<div className="relative -mt-4 z-10 px-3 pb-3">
			{/* Name plate */}
			<div className="mb-1.5 ml-2">
				<span className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
					{name}
				</span>
				<span className="ml-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">
					{title}
				</span>
			</div>

			{/* Speech bubble */}
			<button
				type="button"
				className="w-full text-left rounded-2xl px-5 py-4 text-sm leading-relaxed
					bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md
					border border-zinc-200/60 dark:border-zinc-700/50
					shadow-lg text-zinc-800 dark:text-zinc-200 cursor-pointer
					hover:bg-white/90 dark:hover:bg-zinc-900/90 transition-colors"
				onClick={onSpeak}
				title="点击朗读"
			>
				{speech || (
					<span className="text-zinc-400 dark:text-zinc-500 animate-pulse">
						......
					</span>
				)}
				{isLoading && speech && (
					<span className="inline-block w-0.5 h-4 bg-zinc-400 dark:bg-zinc-500 animate-pulse ml-0.5 align-text-bottom" />
				)}
			</button>

			{/* Choices */}
			{hasChoices && (
				<div className="mt-2 space-y-1.5">
					{choices?.map(
						(c, i) =>
							c && (
								<ChoiceButton
									key={c}
									text={c}
									index={i}
									onClick={() => onChoice(c)}
									disabled={isLoading}
								/>
							),
					)}
				</div>
			)}
		</div>
	</div>
);

// ── Layout: Avatar Mode (compact — avatar + speech bubble) ────────────────

const AvatarLayout: FC<LayoutProps> = ({
	persona,
	pose,
	speech,
	isLoading,
	hasChoices,
	choices,
	onChoice,
	onSpeak,
	name,
	title,
}) => (
	<div className="flex-1 flex flex-col justify-end overflow-y-auto px-4 py-4">
		<div className="flex gap-3 items-start">
			{/* Avatar */}
			<div className="shrink-0 pt-1">
				<CharacterAvatar
					persona={persona}
					pose={pose}
					size="lg"
					className="ring-2 ring-white/80 dark:ring-zinc-700/80 shadow-md"
				/>
				<div className="text-center mt-1">
					<div className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 truncate w-14">
						{name}
					</div>
				</div>
			</div>

			{/* Speech + choices */}
			<div className="flex-1 min-w-0 space-y-2">
				{/* Name + title */}
				<div>
					<span className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
						{name}
					</span>
					<span className="ml-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">
						{title}
					</span>
				</div>

				{/* Speech bubble */}
				<button
					type="button"
					className="w-full text-left rounded-2xl px-4 py-3 text-sm leading-relaxed
						bg-white/70 dark:bg-zinc-800/70 backdrop-blur-sm
						border border-zinc-200/60 dark:border-zinc-700/50
						shadow-sm text-zinc-800 dark:text-zinc-200 cursor-pointer
						hover:bg-white/90 dark:hover:bg-zinc-800/90 transition-colors"
					onClick={onSpeak}
					title="点击朗读"
				>
					{speech || (
						<span className="text-zinc-400 dark:text-zinc-500 animate-pulse">
							......
						</span>
					)}
					{isLoading && speech && (
						<span className="inline-block w-0.5 h-4 bg-zinc-400 dark:bg-zinc-500 animate-pulse ml-0.5 align-text-bottom" />
					)}
				</button>

				{/* Choices */}
				{hasChoices && (
					<div className="space-y-1.5">
						{choices?.map(
							(c, i) =>
								c && (
									<ChoiceButton
										key={c}
										text={c}
										index={i}
										onClick={() => onChoice(c)}
										disabled={isLoading}
									/>
								),
						)}
					</div>
				)}
			</div>
		</div>
	</div>
);

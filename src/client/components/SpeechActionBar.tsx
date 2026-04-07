import { Check, Copy, Volume2, VolumeOff } from "lucide-react";
import { type FC, useCallback, useState } from "react";

/**
 * Reusable action bar with speak + copy buttons.
 * Used in dialogue mode below the speech bubble.
 */
export const SpeechActionBar: FC<{
	text: string;
	onSpeak: () => void;
	isSpeaking?: boolean;
	onStopSpeak?: () => void;
	className?: string;
}> = ({ text, onSpeak, isSpeaking, onStopSpeak, className = "" }) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {}
	}, [text]);

	if (!text) return null;

	return (
		<div
			className={`flex items-center gap-1 text-zinc-400 dark:text-zinc-500 ${className}`}
		>
			{/* Speak / Stop */}
			<button
				type="button"
				onClick={isSpeaking ? onStopSpeak : onSpeak}
				className="p-1 rounded-md hover:bg-white/30 dark:hover:bg-white/10 hover:text-purple-500 transition-colors cursor-pointer"
				title={isSpeaking ? "停止朗读" : "朗读"}
			>
				{isSpeaking ? (
					<VolumeOff className="w-3.5 h-3.5" />
				) : (
					<Volume2 className="w-3.5 h-3.5" />
				)}
			</button>

			{/* Copy */}
			<button
				type="button"
				onClick={handleCopy}
				className="p-1 rounded-md hover:bg-white/30 dark:hover:bg-white/10 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
				title={copied ? "已复制" : "复制"}
			>
				{copied ? (
					<Check className="w-3.5 h-3.5 text-emerald-500" />
				) : (
					<Copy className="w-3.5 h-3.5" />
				)}
			</button>
		</div>
	);
};

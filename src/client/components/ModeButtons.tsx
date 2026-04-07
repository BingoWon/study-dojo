import { useAuiState } from "@assistant-ui/react";
import { Mic, Sparkles } from "lucide-react";
import type { FC } from "react";
import { useDialogueMode, useVoiceMode } from "../RuntimeProvider";

export const ModeButtons: FC<{ variant?: "compact" | "card" }> = ({
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

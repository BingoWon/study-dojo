import { makeAssistantToolUI, useToolArgsStatus } from "@assistant-ui/react";
import { Check, MessageCircleQuestion, Send } from "lucide-react";
import { useState } from "react";

type Option = {
	label: string;
	value: string;
	description?: string;
};

type Args = {
	question: string;
	options: Option[];
	allowCustomInput?: boolean;
	placeholder?: string;
};

type Result = {
	answer: string;
	source: "option" | "custom";
};

export const AskUserToolUI = makeAssistantToolUI<Args, Result>({
	toolName: "ask_user",
	render: ({ args, result, addResult }) => {
		const { propStatus } = useToolArgsStatus<Args>();

		// Already answered — compact confirmation
		if (result) {
			return (
				<div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
					<Check className="w-3.5 h-3.5 shrink-0" />
					<span className="font-medium">{result.answer}</span>
				</div>
			);
		}

		const options = args?.options ?? [];
		const optionsStreaming = propStatus.options === "streaming";
		const question = args?.question ?? "";

		if (question && options.length > 0) {
			return (
				<AskUserCard
					question={question}
					options={options}
					optionsStreaming={optionsStreaming}
					allowCustomInput={args?.allowCustomInput ?? true}
					placeholder={args?.placeholder}
					addResult={addResult}
				/>
			);
		}

		return null;
	},
});

function AskUserCard({
	question,
	options,
	optionsStreaming,
	allowCustomInput,
	placeholder,
	addResult,
}: {
	question: string;
	options: Option[];
	optionsStreaming: boolean;
	allowCustomInput: boolean;
	placeholder?: string;
	addResult: (result: Result) => void;
}) {
	const [custom, setCustom] = useState("");
	const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

	return (
		<div className="mb-3 rounded-2xl border border-amber-200/60 dark:border-amber-800/30 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm">
			{/* Header */}
			<div className="flex items-center gap-2 px-4 py-3 border-b border-divider dark:border-divider-dark">
				<div className="p-1 rounded-lg bg-amber-100 dark:bg-amber-900/30">
					<MessageCircleQuestion className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
				</div>
				<span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex-1">
					{question}
				</span>
				{optionsStreaming && (
					<span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 animate-pulse">
						生成中...
					</span>
				)}
			</div>

			{/* Options */}
			<div className="p-3 space-y-1.5">
				{options.map((opt, i) => (
					<button
						key={opt.value}
						type="button"
						disabled={optionsStreaming}
						onClick={() => addResult({ answer: opt.value, source: "option" })}
						onMouseEnter={() => setHoveredIdx(i)}
						onMouseLeave={() => setHoveredIdx(null)}
						className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm transition-all cursor-pointer border ${
							hoveredIdx === i
								? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200"
								: "bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200/60 dark:border-zinc-700/40 text-zinc-700 dark:text-zinc-300"
						}`}
					>
						<span className="font-medium">{opt.label}</span>
						{opt.description && (
							<span className="block text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
								{opt.description}
							</span>
						)}
						{optionsStreaming && i === options.length - 1 && (
							<span className="ml-1 inline-block w-1.5 h-3.5 bg-amber-400 dark:bg-amber-500 animate-pulse rounded-sm align-middle" />
						)}
					</button>
				))}
			</div>

			{/* Custom input */}
			{!optionsStreaming && allowCustomInput && (
				<div className="px-3 pb-3">
					<div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-700/40 bg-zinc-50/50 dark:bg-zinc-800/30 focus-within:border-amber-300 dark:focus-within:border-amber-700 transition-colors">
						<input
							type="text"
							value={custom}
							onChange={(e) => setCustom(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && custom.trim())
									addResult({ answer: custom.trim(), source: "custom" });
							}}
							placeholder={placeholder || "输入自定义回答..."}
							className="flex-1 bg-transparent text-sm outline-none text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-600 min-w-0"
						/>
						{custom.trim() && (
							<button
								type="button"
								onClick={() =>
									addResult({ answer: custom.trim(), source: "custom" })
								}
								className="p-1 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition cursor-pointer shrink-0"
							>
								<Send className="w-3.5 h-3.5" />
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

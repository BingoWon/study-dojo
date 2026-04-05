import {
	makeAssistantToolUI,
	useToolArgsStatus,
} from "@assistant-ui/react";
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
	render: ({ args, result, addResult, status }) => {
		const { propStatus } = useToolArgsStatus<Args>();

		// Already answered — compact confirmation
		if (result) {
			return (
				<div className="mb-3 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
					<Check className="w-3.5 h-3.5" />
					已回答：{result.answer}
				</div>
			);
		}

		const options = args?.options ?? [];
		const optionsStreaming = propStatus.options === "streaming";
		const question = args?.question ?? "";

		// Show card as soon as question + any option is available
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

		// Still waiting
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
	const [selected, setSelected] = useState<number | null>(null);
	const [custom, setCustom] = useState("");

	const canSubmit = selected !== null && !optionsStreaming;

	const handleSubmit = () => {
		if (custom.trim() && selected === null) {
			addResult({ answer: custom.trim(), source: "custom" });
			return;
		}
		if (selected !== null && options[selected]) {
			addResult({ answer: options[selected].value, source: "option" });
		}
	};

	return (
		<div className="mb-3 rounded-2xl border border-zinc-200/60 dark:border-zinc-700/50 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-divider dark:border-divider-dark">
				<div className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
					<div className="p-1 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
						<MessageCircleQuestion className="w-4 h-4" />
					</div>
					{question}
				</div>
				<span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0">
					{optionsStreaming ? "生成中..." : "等待回答"}
				</span>
			</div>

			{/* Options */}
			<div className="p-4 space-y-2">
				<div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
					请选择
				</div>
				{options.map((opt, i) => (
					<button
						key={`opt-${i}`}
						type="button"
						onClick={() => {
							setSelected(i);
							setCustom("");
						}}
						className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition cursor-pointer border ${
							selected === i
								? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
								: "bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200/60 dark:border-zinc-700/40 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600"
						}`}
					>
						<div className="font-medium">{opt.label}</div>
						{opt.description && (
							<div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
								{opt.description}
							</div>
						)}
						{optionsStreaming && i === options.length - 1 && (
							<span className="ml-1 inline-block w-1.5 h-3.5 bg-blue-400 dark:bg-blue-500 animate-pulse rounded-sm" />
						)}
					</button>
				))}

				{/* Custom input — inline as the last "option" */}
				{!optionsStreaming && allowCustomInput && (
					<div
						className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition ${
							custom.trim() && selected === null
								? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700"
								: "bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200/60 dark:border-zinc-700/40"
						}`}
					>
						<input
							type="text"
							value={custom}
							onChange={(e) => {
								setCustom(e.target.value);
								setSelected(null);
							}}
							onFocus={() => setSelected(null)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && custom.trim()) handleSubmit();
							}}
							placeholder={placeholder || "自定义输入..."}
							className="flex-1 bg-transparent text-sm outline-none text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-600"
						/>
						{custom.trim() && (
							<button
								type="button"
								onClick={handleSubmit}
								className="p-1 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition cursor-pointer"
							>
								<Send className="w-3.5 h-3.5" />
							</button>
						)}
					</div>
				)}
			</div>

			{/* Submit bar */}
			{!optionsStreaming && (
				<div className="flex items-center gap-2 px-4 py-3 border-t border-divider dark:border-divider-dark">
					<button
						type="button"
						disabled={!canSubmit && !custom.trim()}
						onClick={handleSubmit}
						className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
							canSubmit || custom.trim()
								? "bg-blue-500 hover:bg-blue-600 text-white cursor-pointer shadow-sm"
								: "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
						}`}
					>
						<Check className="w-3 h-3" />
						确认
					</button>
				</div>
			)}
		</div>
	);
}

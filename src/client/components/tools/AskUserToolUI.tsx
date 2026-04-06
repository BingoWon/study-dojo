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

		// Already answered — compact inline
		if (result) {
			return (
				<div className="mb-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
					<Check className="w-3 h-3" />
					{result.answer}
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

	return (
		<div className="mb-2 rounded-xl border border-zinc-200/60 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/50 overflow-hidden">
			{/* Question */}
			<div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
				<MessageCircleQuestion className="w-3.5 h-3.5 text-amber-500 shrink-0" />
				{question}
				{optionsStreaming && (
					<span className="ml-auto text-[10px] text-amber-500 animate-pulse shrink-0">
						生成中...
					</span>
				)}
			</div>

			{/* Options — single click to submit */}
			<div className="px-3 pb-2 flex flex-wrap gap-1.5">
				{options.map((opt, i) => (
					<button
						key={opt.value}
						type="button"
						disabled={optionsStreaming}
						onClick={() => addResult({ answer: opt.value, source: "option" })}
						className="px-3 py-1.5 rounded-lg text-xs transition cursor-pointer border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 active:scale-95"
						title={opt.description}
					>
						{opt.label}
						{optionsStreaming && i === options.length - 1 && (
							<span className="ml-1 inline-block w-1 h-3 bg-blue-400 animate-pulse rounded-sm" />
						)}
					</button>
				))}
			</div>

			{/* Custom input — only if allowed, inline compact */}
			{!optionsStreaming && allowCustomInput && (
				<div className="flex items-center gap-1.5 mx-3 mb-2 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
					<input
						type="text"
						value={custom}
						onChange={(e) => setCustom(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && custom.trim())
								addResult({
									answer: custom.trim(),
									source: "custom",
								});
						}}
						placeholder={placeholder || "或输入自定义回答..."}
						className="flex-1 bg-transparent text-xs outline-none text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-600 min-w-0"
					/>
					{custom.trim() && (
						<button
							type="button"
							onClick={() =>
								addResult({
									answer: custom.trim(),
									source: "custom",
								})
							}
							className="p-0.5 text-blue-500 hover:text-blue-600 transition cursor-pointer shrink-0"
						>
							<Send className="w-3 h-3" />
						</button>
					)}
				</div>
			)}
		</div>
	);
}

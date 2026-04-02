import { Bot, ChevronRight, CloudRain, Search } from "lucide-react";
import type { FC } from "react";

export const EmptyState: FC<{
	onPredefinedClick?: (text: string) => void;
}> = ({ onPredefinedClick }) => (
	<div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 animate-in fade-in duration-700 pointer-events-none select-none">
		<div className="w-20 h-20 mb-6 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 flex items-center justify-center shadow-xl dark:shadow-2xl pointer-events-none ring-1 ring-black/5 dark:ring-white/10 mt-12 transition-colors">
			<Bot className="w-10 h-10 text-zinc-400 dark:text-zinc-400" />
		</div>
		<h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-zinc-800 to-zinc-400 dark:from-white dark:to-zinc-500 mb-3 tracking-tight">
			AI 沙盒
		</h2>
		<p className="text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto text-sm leading-relaxed mb-6">
			体验 AG-UI 核心能力：生成式交互界面、透明推理链路与实时工具调用。
		</p>

		{/* Predefined Prompts */}
		<div className="flex flex-col gap-2 w-full max-w-sm mx-auto pointer-events-auto">
			{[
				{
					label: "生成式组件 (天气卡片)",
					prompt: "北京今天天气怎么样？",
					icon: CloudRain,
					color:
						"text-blue-500 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
				},
				{
					label: "工具调用流式执行",
					prompt: "帮我搜索关于新能源汽车的最新大事件",
					icon: Search,
					color:
						"text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
				},
				{
					label: "思维逻辑链 (CoT)",
					prompt: "strawberry 里面有几个 r？请一步步思考。",
					icon: Bot,
					color:
						"text-violet-500 dark:text-violet-400 bg-violet-500/10 border-violet-500/20",
				},
			].map((item) => (
				<button
					type="button"
					key={item.label}
					onClick={() => onPredefinedClick?.(item.prompt)}
					className="flex items-center gap-3 p-3 rounded-2xl bg-white/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/5 hover:bg-zinc-100 dark:hover:bg-white/5 hover:border-zinc-300 dark:hover:border-white/10 transition-all group text-left shadow-sm"
				>
					<div className={`p-2 rounded-xl border ${item.color}`}>
						<item.icon className="w-4 h-4" />
					</div>
					<div className="flex-1 overflow-hidden">
						<div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 drop-shadow-sm">
							{item.label}
						</div>
						<div className="text-[11px] text-zinc-500 dark:text-zinc-500 truncate mt-0.5">
							{item.prompt}
						</div>
					</div>
					<ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 group-hover:translate-x-1 transition-all" />
				</button>
			))}
		</div>
	</div>
);

/**
 * /dev/tools — Preview page for all interactive tool UI components.
 * Full-screen horizontal layout showing each tool card in various states.
 */

import {
	BookOpen,
	Check,
	Globe,
	GraduationCap,
	Loader2,
	MessageCircleQuestion,
	Search,
	Send,
	Sparkles,
	X,
} from "lucide-react";
import { type FC, type ReactNode, useState } from "react";
import type { ExaResult } from "./components/tools/ExaResultList";
import { ExaResultList } from "./components/tools/ExaResultList";

const MOCK_RESULTS: ExaResult[] = [
	{
		title: "Attention Is All You Need",
		url: "https://arxiv.org/abs/1706.03762",
		text: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
		publishedDate: "2017-06-12",
		author: "Vaswani et al.",
	},
	{
		title: "BERT: Pre-training of Deep Bidirectional Transformers",
		url: "https://arxiv.org/abs/1810.04805",
		text: "We introduce a new language representation model called BERT.",
		publishedDate: "2018-10-11",
		author: "Devlin et al.",
	},
	{
		title: "Language Models are Few-Shot Learners (GPT-3)",
		url: "https://arxiv.org/abs/2005.14165",
		text: "Recent work has demonstrated substantial gains on many NLP tasks by pre-training on a large corpus.",
		publishedDate: "2020-05-28",
		author: "Brown et al.",
	},
];

const Col: FC<{ title: string; children: ReactNode }> = ({
	title,
	children,
}) => (
	<div className="flex flex-col min-w-0">
		<h2 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 px-1">
			{title}
		</h2>
		<div className="space-y-2 flex-1">{children}</div>
	</div>
);

const DevTools: FC = () => {
	const [askResult, setAskResult] = useState<string | null>(null);
	const [askCustom, setAskCustom] = useState("");
	const [suggestResult, setSuggestResult] = useState<string | null>(null);
	const [suggestSel, setSuggestSel] = useState<number | null>(null);
	const [suggestCustom, setSuggestCustom] = useState("");
	const [topK, setTopK] = useState(5);
	const [hovered, setHovered] = useState<number | null>(null);

	return (
		<div className="h-dvh w-screen bg-[#dedee9] dark:bg-[#1a1a2e] text-zinc-900 dark:text-zinc-100 relative overflow-hidden flex flex-col">
			{/* Background blobs */}
			<div
				className="absolute w-[500px] h-[500px] left-[60%] top-[-5%] rounded-full z-0"
				style={{ background: "rgba(255, 172, 77, 0.15)", filter: "blur(100px)" }}
			/>
			<div
				className="absolute w-[600px] h-[600px] left-[10%] top-[50%] rounded-full z-0"
				style={{ background: "rgba(255, 243, 136, 0.2)", filter: "blur(100px)" }}
			/>
			<div
				className="absolute w-[500px] h-[500px] left-[80%] top-[60%] rounded-full z-0"
				style={{ background: "#C9C9DA", filter: "blur(100px)", opacity: 0.4 }}
			/>

			{/* Header */}
			<div className="relative z-10 text-center pt-4 pb-2 shrink-0">
				<h1 className="text-lg font-bold">Tool UI 预览</h1>
				<p className="text-[10px] text-zinc-400 dark:text-zinc-500">
					交互式工具卡片 · 各状态展示
				</p>
			</div>

			{/* Grid */}
			<div className="relative z-10 flex-1 grid grid-cols-4 gap-3 px-4 pb-4 min-h-0 overflow-hidden">
				{/* ── Column 1: ask_user ─────────────────────────── */}
				<Col title="ask_user">
					{!askResult ? (
						<div className="rounded-2xl border border-amber-200/60 dark:border-amber-800/30 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm">
							<div className="flex items-center gap-2 px-3 py-2 border-b border-divider dark:border-divider-dark">
								<div className="p-1 rounded-lg bg-amber-100 dark:bg-amber-900/30">
									<MessageCircleQuestion className="w-3 h-3 text-amber-600 dark:text-amber-400" />
								</div>
								<span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
									你想用哪种方式阅读？
								</span>
							</div>
							<div className="p-2 space-y-1">
								{[
									{ label: "📖 逐章精读", value: "chapter", desc: "按章节深入" },
									{ label: "🔍 重点检索", value: "search", desc: "直接搜关键词" },
									{ label: "📝 快速总结", value: "summary", desc: "先看概要" },
								].map((opt, i) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => setAskResult(opt.label)}
										onMouseEnter={() => setHovered(i)}
										onMouseLeave={() => setHovered(null)}
										className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all cursor-pointer border ${
											hovered === i
												? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700"
												: "bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200/60 dark:border-zinc-700/40"
										}`}
									>
										<span className="font-medium">{opt.label}</span>
										<span className="block text-[10px] text-zinc-400 mt-0.5">{opt.desc}</span>
									</button>
								))}
							</div>
							<div className="px-2 pb-2">
								<div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200/60 dark:border-zinc-700/40 bg-zinc-50/50 dark:bg-zinc-800/30 focus-within:border-amber-300 dark:focus-within:border-amber-700 transition-colors">
									<input
										type="text"
										value={askCustom}
										onChange={(e) => setAskCustom(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && askCustom.trim()) {
												setAskResult(askCustom.trim());
												setAskCustom("");
											}
										}}
										placeholder="自定义回答..."
										className="flex-1 bg-transparent text-xs outline-none text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 min-w-0"
									/>
									{askCustom.trim() && (
										<button
											type="button"
											onClick={() => { setAskResult(askCustom.trim()); setAskCustom(""); }}
											className="p-0.5 text-amber-500 hover:text-amber-600 transition cursor-pointer shrink-0"
										>
											<Send className="w-3 h-3" />
										</button>
									)}
								</div>
							</div>
						</div>
					) : (
						<div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
							<Check className="w-3.5 h-3.5 shrink-0" />
							<span className="font-medium flex-1">{askResult}</span>
							<button type="button" onClick={() => setAskResult(null)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
								<X className="w-3 h-3" />
							</button>
						</div>
					)}
				</Col>

				{/* ── Column 2: doc_suggest ──────────────────────── */}
				<Col title="doc_suggest">
					{/* Loading pill */}
					<div className="flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/30 px-3 py-2 text-xs text-blue-600 dark:text-blue-400">
						<Loader2 className="w-3 h-3 animate-spin" />
						<span className="font-medium">正在生成检索建议...</span>
					</div>

					{!suggestResult ? (
						<div className="rounded-2xl border border-blue-200/60 dark:border-blue-800/30 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm">
							<div className="flex items-center justify-between px-3 py-2 border-b border-divider dark:border-divider-dark">
								<div className="flex items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">
									<div className="p-1 rounded-lg bg-blue-100 dark:bg-blue-900/30">
										<BookOpen className="w-3 h-3 text-blue-600 dark:text-blue-400" />
									</div>
									文档检索
								</div>
								<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
									等待确认
								</span>
							</div>
							<div className="p-2 space-y-1">
								{["Transformer self-attention 复杂度", "多头注意力设计动机", "位置编码方案对比"].map((q, i) => (
									<button
										key={q}
										type="button"
										onClick={() => setSuggestSel(i)}
										className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all cursor-pointer border ${
											suggestSel === i
												? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
												: "bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200/60 dark:border-zinc-700/40 text-zinc-700 dark:text-zinc-300"
										}`}
									>
										{q}
									</button>
								))}
								{/* Custom query input */}
								<div
									className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
										suggestSel === 3
											? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700"
											: "bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200/60 dark:border-zinc-700/40"
									}`}
								>
									<input
										type="text"
										value={suggestCustom}
										onChange={(e) => { setSuggestCustom(e.target.value); setSuggestSel(3); }}
										onFocus={() => setSuggestSel(3)}
										placeholder="自定义查询..."
										className="flex-1 bg-transparent text-xs outline-none text-zinc-700 dark:text-zinc-300 placeholder-zinc-400"
									/>
								</div>
							</div>
							<div className="px-3 pb-2">
								<div className="flex items-center justify-between mb-1">
									<span className="text-[10px] text-zinc-400">检索数量</span>
									<span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 tabular-nums">{topK} 条</span>
								</div>
								<input type="range" min={1} max={20} value={topK} onChange={(e) => setTopK(Number(e.target.value))} className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500" />
							</div>
							<div className="flex items-center gap-1.5 px-3 py-2 border-t border-divider dark:border-divider-dark">
								<button type="button" onClick={() => setSuggestResult("auto")} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition cursor-pointer">
									<Sparkles className="w-2.5 h-2.5" /> 帮我选
								</button>
								<button type="button" onClick={() => setSuggestResult("confirm")} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium bg-blue-500 hover:bg-blue-600 text-white cursor-pointer shadow-sm transition">
									<Search className="w-2.5 h-2.5" /> 确认检索
								</button>
								<button type="button" onClick={() => setSuggestResult("skip")} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition cursor-pointer">
									<X className="w-2.5 h-2.5" /> 跳过
								</button>
							</div>
						</div>
					) : (
						<div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs border ${
							suggestResult === "skip"
								? "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200/60 dark:border-zinc-700/40 text-zinc-500"
								: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400"
						}`}>
							{suggestResult === "skip" ? <X className="w-3.5 h-3.5" /> : suggestResult === "auto" ? <Sparkles className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
							<span className="font-medium">
								{suggestResult === "skip" ? "已跳过" : suggestResult === "auto" ? "已委托 AI 选择" : `已确认（${topK} 条）`}
							</span>
							<button type="button" onClick={() => { setSuggestResult(null); setSuggestSel(null); setSuggestCustom(""); }} className="ml-auto text-zinc-400 hover:text-zinc-600 cursor-pointer"><X className="w-3 h-3" /></button>
						</div>
					)}
				</Col>

				{/* ── Column 3: search_web ───────────────────────── */}
				<Col title="search_web">
					{/* Running */}
					<div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-700/40 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm">
						<div className="flex items-center gap-2 px-3 py-2.5">
							<div className="p-1 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
								<Loader2 className="w-3 h-3 text-cyan-500 animate-spin" />
							</div>
							<span className="text-xs font-medium">搜索中...</span>
							<span className="text-[10px] text-zinc-400 italic truncate ml-auto">transformer</span>
						</div>
					</div>
					{/* Complete */}
					<div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-700/40 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm">
						<div className="flex items-center gap-2 px-3 py-2.5 border-b border-divider dark:border-divider-dark">
							<div className="p-1 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
								<Globe className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
							</div>
							<span className="text-xs font-medium">{MOCK_RESULTS.length} 条结果</span>
							<span className="text-[10px] text-zinc-400 italic truncate ml-auto">transformer</span>
						</div>
						<div className="p-1.5">
							<ExaResultList results={MOCK_RESULTS} previewCount={2} />
						</div>
					</div>
				</Col>

				{/* ── Column 4: search_papers + status pills ────── */}
				<Col title="search_papers + 状态">
					<div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-700/40 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm">
						<div className="flex items-center gap-2 px-3 py-2.5 border-b border-divider dark:border-divider-dark">
							<div className="p-1 rounded-lg bg-purple-100 dark:bg-purple-900/30">
								<GraduationCap className="w-3 h-3 text-purple-600 dark:text-purple-400" />
							</div>
							<span className="text-xs font-medium">{MOCK_RESULTS.length} 篇论文</span>
							<span className="text-[10px] text-zinc-400 italic truncate ml-auto">scaling laws</span>
						</div>
						<div className="p-1.5">
							<ExaResultList results={MOCK_RESULTS} previewCount={2} />
						</div>
					</div>

					{/* Status pills showcase */}
					<div className="space-y-1.5 mt-1">
						<div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">完成态</div>
						<div className="flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/30 px-3 py-2 text-xs text-blue-600 dark:text-blue-400">
							<Loader2 className="w-3 h-3 animate-spin" />
							<span className="font-medium">正在检索文档...</span>
						</div>
						<div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
							<BookOpen className="w-3 h-3 shrink-0" />
							<span className="font-medium">已从 3 份文档中检索到相关内容</span>
						</div>
						<div className="flex items-center gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/40 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
							<BookOpen className="w-3 h-3 shrink-0" />
							<span className="font-medium">未找到相关内容</span>
						</div>
					</div>
				</Col>
			</div>
		</div>
	);
};

export default DevTools;

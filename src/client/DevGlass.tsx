/**
 * /dev/glass — Test page for debugging backdrop-filter rendering
 * across different stacking contexts, positions, and compositing strategies.
 */

import { type FC, useState } from "react";

const STRATEGIES = [
	{
		id: "inline",
		label: "1. 普通流内 (center panel 同款)",
		desc: "和中间面板一样，在文档流内使用 backdrop-blur-sm",
		wrapperClass: "relative",
		panelClass:
			"bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-white/60 dark:border-zinc-700/50",
	},
	{
		id: "dialogue-current",
		label: "2. 当前 dialogue-glass 样式",
		desc: "当前部署出问题的样式 — .dialogue-glass CSS 类",
		wrapperClass: "relative",
		panelClass: "dialogue-glass",
	},
	{
		id: "fixed-pointer-none",
		label: "3. fixed + pointer-events-none 容器",
		desc: "模拟实际的对话面板结构：fixed 父 + pointer-events-none + auto 子",
		isFixed: true,
		pointerNone: true,
		panelClass: "dialogue-glass",
	},
	{
		id: "fixed-no-pointer",
		label: "4. fixed 但无 pointer-events-none",
		desc: "去掉 pointer-events-none 看是否是它导致的",
		isFixed: true,
		pointerNone: false,
		panelClass: "dialogue-glass",
	},
	{
		id: "fixed-isolation",
		label: "5. fixed + isolation: isolate",
		desc: "给面板添加 isolation: isolate 创建新的层叠上下文",
		isFixed: true,
		pointerNone: true,
		panelClass: "dialogue-glass",
		extraStyle: { isolation: "isolate" as const },
	},
	{
		id: "fixed-will-change",
		label: "6. fixed + will-change: backdrop-filter",
		desc: "提示浏览器提前准备 backdrop-filter 合成层",
		isFixed: true,
		pointerNone: true,
		panelClass: "dialogue-glass",
		extraStyle: { willChange: "backdrop-filter" },
	},
	{
		id: "fixed-transform",
		label: "7. fixed + transform: translateZ(0)",
		desc: "强制创建 GPU 合成层，可能修复 backdrop-filter",
		isFixed: true,
		pointerNone: true,
		panelClass: "dialogue-glass",
		extraStyle: { transform: "translateZ(0)" },
	},
	{
		id: "inline-blur-class",
		label: "8. Tailwind backdrop-blur-xl (内联)",
		desc: "不用自定义 CSS，纯 Tailwind 类名",
		wrapperClass: "relative",
		panelClass:
			"bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border border-white/50 dark:border-zinc-700/50 shadow-lg",
	},
	{
		id: "fixed-blur-class",
		label: "9. Tailwind backdrop-blur-xl (fixed)",
		desc: "同上但在 fixed 定位下",
		isFixed: true,
		pointerNone: true,
		panelClass:
			"bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border border-white/50 dark:border-zinc-700/50 shadow-lg",
	},
	{
		id: "fixed-high-opacity",
		label: "10. 高不透明度兜底 (0.92)",
		desc: "不依赖 backdrop-filter，靠自身 opacity 保证效果",
		isFixed: true,
		pointerNone: true,
		panelClass:
			"bg-white/[0.92] dark:bg-zinc-900/[0.92] backdrop-blur-xl border border-white/60 dark:border-zinc-700/50 shadow-lg",
	},
] as {
	id: string;
	label: string;
	desc: string;
	wrapperClass?: string;
	panelClass: string;
	isFixed?: boolean;
	pointerNone?: boolean;
	extraStyle?: React.CSSProperties;
}[];

const GlassCard: FC<{ label: string; className?: string; style?: React.CSSProperties }> = ({
	label,
	className = "",
	style,
}) => (
	<div className={`rounded-2xl p-5 ${className}`} style={style}>
		<div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{label}</div>
		<div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
			这段文字应该能看到背后的渐变色块被模糊
		</div>
	</div>
);

const DevGlass: FC = () => {
	const [activeFixed, setActiveFixed] = useState<string | null>(null);

	return (
		<div className="min-h-dvh bg-[#dedee9] dark:bg-[#1a1a2e] text-zinc-900 dark:text-zinc-100 relative overflow-hidden">
			{/* 背景渐变色块 — 和 App.tsx 完全一致 */}
			<div
				className="absolute w-[446px] h-[446px] left-[65%] top-[1%] rounded-full z-0"
				style={{ background: "rgba(255, 172, 77, 0.2)", filter: "blur(103px)" }}
			/>
			<div
				className="absolute w-[609px] h-[609px] left-[85%] top-[60%] rounded-full z-0"
				style={{ background: "#C9C9DA", filter: "blur(103px)" }}
			/>
			<div
				className="absolute w-[609px] h-[609px] left-[40%] top-[-30%] rounded-full z-0"
				style={{ background: "#C9C9DA", filter: "blur(103px)" }}
			/>
			<div
				className="absolute w-[609px] h-[609px] left-[30%] top-[70%] rounded-full z-0"
				style={{ background: "#F3F3FC", filter: "blur(103px)" }}
			/>
			<div
				className="absolute w-[446px] h-[446px] left-[8%] top-[30%] rounded-full z-0"
				style={{ background: "rgba(255, 243, 136, 0.3)", filter: "blur(103px)" }}
			/>

			{/* 内容 */}
			<div className="relative z-10 max-w-4xl mx-auto p-8 space-y-6">
				<div className="text-center space-y-2 mb-8">
					<h1 className="text-2xl font-bold">Backdrop-Filter 测试面板</h1>
					<p className="text-sm text-zinc-500 dark:text-zinc-400">
						对比不同定位/层叠策略下磨玻璃效果的渲染差异，找到云端和本地一致的方案
					</p>
				</div>

				{/* 内联测试区 */}
				<div className="space-y-4">
					<h2 className="text-lg font-semibold">内联定位（文档流内）</h2>
					<div className="grid grid-cols-2 gap-4">
						{STRATEGIES.filter((s) => !s.isFixed).map((s) => (
							<div key={s.id}>
								<GlassCard
									label={s.label}
									className={s.panelClass}
									style={s.extraStyle}
								/>
								<p className="text-[10px] text-zinc-400 mt-1 px-1">{s.desc}</p>
							</div>
						))}
					</div>
				</div>

				{/* Fixed 定位测试按钮 */}
				<div className="space-y-4">
					<h2 className="text-lg font-semibold">Fixed 定位（模拟对话面板）</h2>
					<p className="text-xs text-zinc-500">
						点击按钮在底部显示 fixed 面板，对比效果。再次点击关闭。
					</p>
					<div className="flex flex-wrap gap-2">
						{STRATEGIES.filter((s) => s.isFixed).map((s) => (
							<button
								key={s.id}
								type="button"
								onClick={() =>
									setActiveFixed(activeFixed === s.id ? null : s.id)
								}
								className={`px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer
									${activeFixed === s.id
										? "bg-blue-500 text-white"
										: "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
									}`}
							>
								{s.label}
							</button>
						))}
					</div>
					{activeFixed && (
						<p className="text-[10px] text-zinc-400">
							{STRATEGIES.find((s) => s.id === activeFixed)?.desc}
						</p>
					)}
				</div>

				{/* 占位高度确保可滚动 */}
				<div className="h-[40vh]" />
			</div>

			{/* Fixed 面板渲染 */}
			{activeFixed &&
				(() => {
					const s = STRATEGIES.find((st) => st.id === activeFixed);
					if (!s || !s.isFixed) return null;
					return (
						<div
							className={`fixed inset-x-0 bottom-0 z-30 ${s.pointerNone ? "pointer-events-none" : ""}`}
						>
							<div className="flex justify-center pb-6 px-8">
								<div
									className={`w-3/5 min-w-[400px] ${s.pointerNone ? "pointer-events-auto" : ""}`}
								>
									<div
										className={`rounded-3xl p-5 ${s.panelClass}`}
										style={s.extraStyle}
									>
										<div className="flex items-center justify-between">
											<div>
												<div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
													{s.label}
												</div>
												<div className="text-xs text-zinc-500 mt-1">
													{s.desc}
												</div>
											</div>
											<button
												type="button"
												onClick={() => setActiveFixed(null)}
												className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-xs font-medium cursor-pointer hover:bg-zinc-300 dark:hover:bg-zinc-600"
											>
												关闭
											</button>
										</div>
										<div className="mt-3 space-y-2">
											<div className="h-8 rounded-lg bg-white/30 dark:bg-white/5" />
											<div className="h-8 rounded-lg bg-white/30 dark:bg-white/5" />
											<div className="h-8 rounded-lg bg-white/30 dark:bg-white/5" />
										</div>
									</div>
								</div>
							</div>
						</div>
					);
				})()}
		</div>
	);
};

export default DevGlass;

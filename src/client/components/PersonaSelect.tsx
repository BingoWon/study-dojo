import { Check } from "lucide-react";
import type { FC } from "react";
import { PERSONA_IDS, PERSONAS } from "../../worker/model";
import { usePersona } from "../RuntimeProvider";
import { ModeButtons } from "./ModeButtons";

export const PersonaSelect: FC = () => {
	const { persona, setPersona } = usePersona();

	return (
		<div className="mx-auto my-auto flex w-full max-w-md flex-grow flex-col items-center justify-center gap-6 px-4">
			<div className="text-center">
				<div className="text-sm font-medium tracking-widest uppercase text-zinc-400 dark:text-zinc-500 mb-2">
					选择你的导师
				</div>
				<div className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
					开始论文陪读之旅
				</div>
			</div>

			<div className="flex w-full flex-col gap-8 pt-8">
				{PERSONA_IDS.map((id) => {
					const p = PERSONAS[id];
					const selected = persona === id;
					return (
						<button
							key={id}
							type="button"
							onClick={() => setPersona(id)}
							className={`
								group relative w-full rounded-2xl overflow-visible cursor-pointer
								transition-all duration-300
								${selected ? "scale-[1.02]" : ""}
							`}
						>
							<div
								className={`
									relative rounded-2xl py-3.5 pr-4 pl-[108px]
									bg-gradient-to-r ${p.gradient}
									border-2 transition-all duration-300 overflow-hidden
									${
										selected
											? `${p.border} shadow-xl ${p.glow}`
											: "border-transparent group-hover:border-zinc-200/80 dark:group-hover:border-zinc-700/60 group-hover:shadow-lg"
									}
								`}
							>
								<div className={`shimmer-sweep ${selected ? "active" : ""}`} />
								<div className="text-left min-w-0 relative z-10">
									<div className="flex items-center gap-2">
										<span className="font-bold text-zinc-900 dark:text-zinc-100">
											{p.name}
										</span>
										<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 font-medium">
											{p.title}
										</span>
									</div>
									<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
										{p.desc}
									</p>
								</div>
							</div>

							<div
								className={`
									absolute -right-3 top-1/2 -translate-y-1/2 z-20
									w-8 h-8 rounded-full flex items-center justify-center
									shadow-lg transition-all duration-300
									${selected ? "opacity-100 scale-100" : "opacity-0 scale-0"}
								`}
								style={{ backgroundColor: p.accentColor }}
							>
								<Check className="w-4.5 h-4.5 text-white" strokeWidth={3} />
							</div>

							<img
								src={`/characters/${id}/avatars/neutral.webp`}
								alt={p.name}
								draggable={false}
								className={`
									absolute left-3 bottom-0 w-[88px] h-[88px] z-10
									object-cover select-none
									transition-all duration-300 ease-out
									${selected ? "scale-110 -translate-y-1 drop-shadow-xl" : "group-hover:scale-105 group-hover:-translate-y-0.5 drop-shadow-md"}
								`}
							/>
						</button>
					);
				})}
			</div>

			<div className="w-full pt-4">
				<ModeButtons variant="card" />
			</div>

			<p className="text-[11px] text-zinc-400 dark:text-zinc-600 text-center">
				在下方输入消息开始文字对话 · 输入框左下角可随时切换角色和模式
			</p>
		</div>
	);
};

/**
 * /dev/effects — Manual trigger page for dialogue visual effects.
 * Persistent utility page for testing and previewing all effects.
 */

import type { FC } from "react";
import { EFFECTS } from "../shared/dialogue";
import { triggerEffect } from "./lib/effects";

const META: Record<string, { label: string; color: string }> = {
	confetti: { label: "Confetti", color: "bg-amber-600" },
	fireworks: { label: "Fireworks", color: "bg-orange-600" },
	stars: { label: "Stars", color: "bg-yellow-600" },
	hearts: { label: "Hearts", color: "bg-pink-600" },
	"school-pride": { label: "School Pride", color: "bg-purple-600" },
	flash: { label: "Flash", color: "bg-white/20" },
	"screen-shake": { label: "Screen Shake", color: "bg-red-700" },
	bomb: { label: "Bomb", color: "bg-orange-700" },
	explosions: { label: "Explosions", color: "bg-red-600" },
	lightning: { label: "Lightning", color: "bg-indigo-600" },
	vortex: { label: "Vortex", color: "bg-violet-600" },
	glitch: { label: "Glitch", color: "bg-emerald-700" },
	rain: { label: "Rain", color: "bg-cyan-700" },
	"good-job": { label: "Good Job!", color: "bg-amber-500" },
	"panel-shake": { label: "Panel Shake", color: "bg-rose-700" },
};

const DevEffects: FC = () => (
	<div className="min-h-dvh bg-zinc-950 text-white flex flex-col items-center justify-center gap-10 p-8">
		<div className="text-center space-y-2">
			<h1 className="text-3xl font-bold tracking-wide">
				Visual Effects ({EFFECTS.length})
			</h1>
			<p className="text-sm text-zinc-400">
				Full-screen effects — click to trigger
			</p>
		</div>

		{/* Panel shake target */}
		<div
			id="dialogue-overlay"
			className="w-[500px] rounded-2xl border border-zinc-700"
		>
			<div className="dialogue-glass rounded-2xl p-6 text-center text-zinc-400 text-sm">
				Dialogue panel (panel-shake target)
			</div>
		</div>

		<div className="flex flex-wrap justify-center gap-3 max-w-3xl">
			{EFFECTS.map((effect) => {
				const m = META[effect] ?? { label: effect, color: "bg-zinc-800" };
				return (
					<button
						key={effect}
						type="button"
						onClick={() => triggerEffect(effect)}
						className={`px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium
							${m.color} hover:brightness-125 active:scale-95 transition-all cursor-pointer`}
					>
						{m.label}
					</button>
				);
			})}
		</div>
	</div>
);

export default DevEffects;

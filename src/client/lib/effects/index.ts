/** Effect dispatcher — routes effect names to implementations. */

import { EFFECTS, type Effect } from "../../../shared/dialogue";
import { effectBomb, effectExplosions } from "./bomb";
import {
	effectFlash,
	effectGlitch,
	effectLightning,
	effectVortex,
} from "./cinematic";
import {
	effectConfetti,
	effectFireworks,
	effectHearts,
	effectSchoolPride,
	effectStars,
} from "./confetti";
import { effectGoodJob } from "./good-job";
import { applyShake } from "./helpers";
import { effectRain } from "./rain";

export function isValidEffect(v: unknown): v is Effect {
	return typeof v === "string" && (EFFECTS as readonly string[]).includes(v);
}

export function triggerEffect(effect: unknown) {
	if (!isValidEffect(effect)) return;
	switch (effect) {
		case "confetti":
			effectConfetti();
			break;
		case "fireworks":
			effectFireworks();
			break;
		case "stars":
			effectStars();
			break;
		case "hearts":
			effectHearts();
			break;
		case "school-pride":
			effectSchoolPride();
			break;
		case "flash":
			effectFlash();
			break;
		case "screen-shake":
			applyShake(document.documentElement);
			break;
		case "bomb":
			effectBomb();
			break;
		case "explosions":
			effectExplosions();
			break;
		case "lightning":
			effectLightning();
			break;
		case "vortex":
			effectVortex();
			break;
		case "glitch":
			effectGlitch();
			break;
		case "rain":
			effectRain();
			break;
		case "good-job":
			effectGoodJob();
			break;
		case "panel-shake":
			applyShake(
				document.querySelector(
					"#dialogue-overlay .dialogue-glass",
				) as HTMLElement | null,
			);
			break;
	}
}

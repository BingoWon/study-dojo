/** canvas-confetti based particle effects. */

import confetti from "canvas-confetti";
import { animLoop } from "./helpers";

export function effectConfetti() {
	confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
}

export function effectFireworks() {
	animLoop(1500, () => {
		confetti({
			particleCount: 5,
			angle: 60 + Math.random() * 60,
			spread: 60,
			startVelocity: 45,
			origin: { x: Math.random(), y: Math.random() * 0.4 },
			colors: ["#ff0", "#f0f", "#0ff", "#f60", "#0f0", "#06f"],
		});
	});
}

export function effectStars() {
	confetti({
		particleCount: 80,
		spread: 100,
		shapes: ["star"],
		colors: ["#ffd700", "#fff", "#fffacd"],
		origin: { y: 0.5 },
	});
}

export function effectHearts() {
	confetti({
		particleCount: 60,
		spread: 90,
		shapes: ["circle"],
		colors: ["#ff69b4", "#ff1493", "#ff6b81", "#ee5a70"],
		scalar: 1.2,
		origin: { y: 0.5 },
	});
}

export function effectSchoolPride() {
	animLoop(1200, () => {
		confetti({
			particleCount: 3,
			angle: 60,
			spread: 55,
			origin: { x: 0, y: 0.65 },
			colors: ["#a855f7", "#6366f1", "#ec4899"],
		});
		confetti({
			particleCount: 3,
			angle: 120,
			spread: 55,
			origin: { x: 1, y: 0.65 },
			colors: ["#f59e0b", "#ef4444", "#10b981"],
		});
	});
}

/** Shared utilities for all visual effects. */

export function domOverlay(css: string, duration: number) {
	const el = document.createElement("div");
	el.style.cssText = `position:fixed;inset:0;z-index:9999;pointer-events:none;${css}`;
	document.body.appendChild(el);
	setTimeout(() => el.remove(), duration);
	return el;
}

export function canvasOverlay(duration: number) {
	const canvas = document.createElement("canvas");
	const w = window.innerWidth;
	const h = window.innerHeight;
	const dpr = devicePixelRatio;
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	canvas.style.cssText = `position:fixed;inset:0;z-index:9999;pointer-events:none;width:${w}px;height:${h}px;`;
	const ctx = canvas.getContext("2d")!;
	ctx.scale(dpr, dpr);
	document.body.appendChild(canvas);
	setTimeout(() => canvas.remove(), duration);
	return { canvas, ctx, w, h };
}

export function applyShake(el: Element | null) {
	if (!el) return;
	el.classList.add("animate-shake");
	setTimeout(() => el.classList.remove("animate-shake"), 600);
}

export function animLoop(duration: number, fn: () => void) {
	const end = Date.now() + duration;
	const frame = () => {
		fn();
		if (Date.now() < end) requestAnimationFrame(frame);
	};
	frame();
}

export function easeOutQuad(t: number) {
	return t * (2 - t);
}

export function easeInQuad(t: number) {
	return t * t;
}

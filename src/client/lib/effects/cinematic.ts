/** DOM/SVG/CSS cinematic effects: flash, lightning, vortex, glitch. */

import { applyShake, domOverlay } from "./helpers";

export function effectFlash() {
	domOverlay(
		"background:white;animation:effect-flash 0.3s ease-out forwards;",
		350,
	);
}

export function effectLightning() {
	const container = domOverlay(
		"background:transparent;animation:lightning-flash 0.8s ease-out forwards;",
		1200,
	);

	const w = window.innerWidth;
	const h = window.innerHeight;
	let x = w * (0.3 + Math.random() * 0.4);
	let y = 0;
	let path = `M ${x} ${y}`;
	while (y < h) {
		y += 30 + Math.random() * 50;
		x += (Math.random() - 0.5) * 100;
		path += ` L ${x} ${y}`;
	}

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
	svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";

	for (const [stroke, sw, blur] of [
		["rgba(180,200,255,0.5)", "12", "blur(8px)"],
		["#fff", "3", ""],
	]) {
		const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
		p.setAttribute("d", path);
		p.setAttribute("fill", "none");
		p.setAttribute("stroke", stroke);
		p.setAttribute("stroke-width", sw);
		if (blur) p.setAttribute("filter", blur);
		p.style.cssText = "animation:lightning-bolt 0.6s ease-out forwards;";
		svg.appendChild(p);
	}

	container.appendChild(svg);

	const flash = document.createElement("div");
	flash.style.cssText =
		"position:absolute;inset:0;background:rgba(200,220,255,0.3);animation:effect-flash 0.15s ease-out forwards;";
	container.appendChild(flash);

	applyShake(document.documentElement);
}

export function effectVortex() {
	const container = domOverlay("", 2000);
	const count = 40;
	for (let i = 0; i < count; i++) {
		const particle = document.createElement("div");
		const angle = (Math.PI * 2 * i) / count;
		const radius = 150 + Math.random() * 200;
		const rotation = 360 + Math.random() * 720;
		const size = 4 + Math.random() * 6;
		const hue = (i / count) * 360;
		const dur = 1.0 + Math.random() * 0.8;
		const x = Math.cos(angle) * radius + window.innerWidth / 2;
		const y = Math.sin(angle) * radius + window.innerHeight / 2;
		particle.style.cssText = `
			position:absolute;left:${x}px;top:${y}px;
			width:${size}px;height:${size}px;border-radius:50%;
			background:hsl(${hue}, 80%, 65%);
			box-shadow:0 0 ${size * 2}px hsl(${hue}, 80%, 65%);
			animation:vortex-particle ${dur}s ease-in forwards;
			--vr:${radius}px;--vrot:${rotation}deg;
		`;
		container.appendChild(particle);
	}
	setTimeout(() => {
		domOverlay(
			"background:radial-gradient(circle at center, rgba(255,255,255,0.6) 0%, transparent 60%);animation:effect-flash 0.4s ease-out forwards;",
			500,
		);
	}, 1000);
}

export function effectGlitch() {
	const container = domOverlay("", 800);
	for (let i = 0; i < 12; i++) {
		const slice = document.createElement("div");
		const gy = Math.random() * 90;
		const gh = 3 + Math.random() * 8;
		const gx = (Math.random() - 0.5) * 40;
		const color = [
			"rgba(255,0,0,0.15)",
			"rgba(0,255,255,0.15)",
			"rgba(255,0,255,0.12)",
		][i % 3];
		const delay = Math.random() * 0.3;
		slice.style.cssText = `
			position:absolute;inset:0;background:${color};
			animation:glitch-slice ${0.2 + Math.random() * 0.3}s ease-out ${delay}s both;
			--gy:${gy}%;--gh:${gh}%;--gx:${gx}px;
		`;
		container.appendChild(slice);
	}
	document.documentElement.style.filter = "hue-rotate(90deg)";
	setTimeout(() => {
		document.documentElement.style.filter = "hue-rotate(-60deg)";
	}, 150);
	setTimeout(() => {
		document.documentElement.style.filter = "";
	}, 400);
}

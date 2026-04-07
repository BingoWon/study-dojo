/** "Good Job!" celebration text effect with SVG decorations. */

import { domOverlay } from "./helpers";

const PALETTE = [
	{ main: "#FBDB4A", shades: ["#FAE073", "#FCE790", "#FADD65", "#E4C650"] },
	{ main: "#F3934A", shades: ["#F7B989", "#F9CDAA", "#DD8644", "#F39C59"] },
	{ main: "#EB547D", shades: ["#EE7293", "#F191AB", "#D64D72", "#C04567"] },
	{ main: "#9F6AA7", shades: ["#B084B6", "#C19FC7", "#916198", "#82588A"] },
	{ main: "#5476B3", shades: ["#6382B9", "#829BC7", "#4D6CA3", "#3E5782"] },
	{ main: "#2BB19B", shades: ["#4DBFAD", "#73CDBF", "#27A18D", "#1F8171"] },
	{ main: "#70B984", shades: ["#7FBE90", "#98CBA6", "#68A87A", "#5E976E"] },
];

const TEXT = "Good Job!";

export function effectGoodJob() {
	const totalDuration = 4000;
	const container = domOverlay(
		"display:flex;align-items:center;justify-content:center;",
		totalDuration,
	);

	// SVG layer for decorations
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	const w = window.innerWidth;
	const h = window.innerHeight;
	svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
	svg.style.cssText =
		"position:absolute;inset:0;width:100%;height:100%;overflow:visible;";
	container.appendChild(svg);

	// Text container
	const textRow = document.createElement("div");
	textRow.style.cssText = "display:flex;gap:4px;position:relative;z-index:1;";
	container.appendChild(textRow);

	const fontSize = Math.min(w / 8, 120);

	// Reveal letters one by one
	const chars = TEXT.split("");
	chars.forEach((char, i) => {
		setTimeout(() => {
			const span = document.createElement("span");
			span.textContent = char;
			const color = PALETTE[i % PALETTE.length];
			span.style.cssText = `
				font-family:'Rubik Mono One',Impact,'Arial Black',sans-serif;
				font-size:${fontSize}px;line-height:1;font-weight:900;
				color:${color.main};display:inline-block;
				text-shadow:0 2px 8px rgba(0,0,0,0.2);
				animation:goodjob-letter 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
			`;
			textRow.appendChild(span);

			// Spawn SVG decorations around this letter
			const rect = span.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			spawnDecor(svg, cx, cy, fontSize, color);
		}, i * 120);
	});

	// Fade out
	setTimeout(() => {
		container.style.transition = "opacity 0.6s ease-out";
		container.style.opacity = "0";
	}, totalDuration - 800);
}

function spawnDecor(
	svg: SVGSVGElement,
	cx: number,
	cy: number,
	size: number,
	color: { main: string; shades: string[] },
) {
	// Triangles
	for (let i = 0; i < 8; i++) {
		const tri = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"polygon",
		);
		const a = Math.random();
		const a2 = a + (Math.random() - 0.5) * 0.4;
		const r = size * 0.5;
		const r2 = r + size * Math.random() * 0.3;
		const x = cx + r * Math.cos(Math.PI * 2 * a);
		const y = cy + r * Math.sin(Math.PI * 2 * a);
		const x2 = cx + r2 * Math.cos(Math.PI * 2 * a2);
		const y2 = cy + r2 * Math.sin(Math.PI * 2 * a2);
		const ts = size * 0.08;
		const scale = 0.3 + Math.random() * 0.7;
		tri.setAttribute("points", `0,0 ${ts * 2},0 ${ts},${ts * 2}`);
		tri.setAttribute("fill", color.shades[i % 4]);
		tri.style.cssText = `
			transform-origin:${ts}px ${ts}px;
			animation:goodjob-decor 0.6s ease-out forwards;
			--x1:${x}px;--y1:${y}px;--x2:${x2}px;--y2:${y2}px;
			--rot:${Math.random() * 360}deg;--sc:${scale};
		`;
		svg.appendChild(tri);
		setTimeout(() => tri.remove(), 700);
	}

	// Circles
	for (let i = 0; i < 8; i++) {
		const circ = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"circle",
		);
		const a = Math.random();
		const r = size * 0.5;
		const r2 = r + size * 0.8;
		const x = cx + r * Math.cos(Math.PI * 2 * a);
		const y = cy + r * Math.sin(Math.PI * 2 * a);
		const x2 = cx + r2 * Math.cos(Math.PI * 2 * a);
		const y2 = cy + r2 * Math.sin(Math.PI * 2 * a);
		circ.setAttribute("r", String(size * 0.04 * Math.random()));
		circ.setAttribute("fill", "#eee");
		circ.style.cssText = `
			animation:goodjob-decor 0.6s ease-out forwards;
			--x1:${x}px;--y1:${y}px;--x2:${x2}px;--y2:${y2}px;
			--rot:0deg;--sc:1;
		`;
		svg.appendChild(circ);
		setTimeout(() => circ.remove(), 700);
	}
}

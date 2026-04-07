/** Canvas-rendered bomb + explosions effects. */

import confetti from "canvas-confetti";
import { applyShake, canvasOverlay, easeInQuad, easeOutQuad } from "./helpers";

// ── Bomb: pixel-art bomb → auto-explode → particles with 3D physics ─────────

// 12×12 pixel bomb sprite — 0=transparent, 1=body(dark), 2=body(mid), 3=highlight, 4=fuse, 5=spark
// prettier-ignore
const BOMB_SPRITE = [
	[0, 0, 0, 0, 0, 0, 0, 5, 5, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 5, 4, 5, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0],
	[0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
	[0, 0, 0, 1, 2, 2, 3, 2, 2, 1, 0, 0],
	[0, 0, 1, 2, 2, 3, 3, 2, 2, 2, 1, 0],
	[0, 0, 1, 2, 3, 3, 2, 2, 2, 2, 1, 0],
	[0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 1, 0],
	[0, 0, 1, 2, 2, 2, 2, 2, 1, 2, 1, 0],
	[0, 0, 0, 1, 2, 2, 2, 2, 1, 1, 0, 0],
	[0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];
const BOMB_COLORS: Record<number, string> = {
	1: "#1a1a2e",
	2: "#2d2d44",
	3: "#4a4a6a",
	4: "#8b5e3c",
	5: "#ff6600",
};

interface Particle {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	color: string;
	size: number;
	alive: boolean;
}

export function effectBomb() {
	const totalDuration = 3500;
	const fuseTime = 1000;
	const { ctx, w, h } = canvasOverlay(totalDuration);
	const cx = w / 2;
	const cy = h / 2;
	const pixelSize = 10;
	const spriteW = BOMB_SPRITE[0].length * pixelSize;
	const spriteH = BOMB_SPRITE.length * pixelSize;
	const offsetX = cx - spriteW / 2;
	const offsetY = cy - spriteH / 2;

	const particles: Particle[] = [];
	for (let r = 0; r < BOMB_SPRITE.length; r++) {
		for (let c = 0; c < BOMB_SPRITE[r].length; c++) {
			const val = BOMB_SPRITE[r][c];
			if (val === 0) continue;
			particles.push({
				x: offsetX + c * pixelSize,
				y: offsetY + r * pixelSize,
				z: 0,
				vx: 0,
				vy: 0,
				vz: 0,
				color: BOMB_COLORS[val] ?? "#333",
				size: pixelSize,
				alive: true,
			});
		}
	}

	let exploded = false;
	let fuseFlicker = 0;
	const start = performance.now();

	const frame = () => {
		const elapsed = performance.now() - start;
		if (elapsed > totalDuration) return;
		ctx.clearRect(0, 0, w, h);

		if (!exploded && elapsed < fuseTime) {
			fuseFlicker++;
			for (const p of particles) {
				let color = p.color;
				if (color === "#ff6600" && fuseFlicker % 6 < 3) color = "#ffcc00";
				ctx.fillStyle = color;
				ctx.fillRect(p.x, p.y, p.size, p.size);
			}
			const glow = ctx.createRadialGradient(
				cx + 15,
				cy - spriteH / 2 - 5,
				0,
				cx + 15,
				cy - spriteH / 2 - 5,
				30,
			);
			glow.addColorStop(
				0,
				`rgba(255,150,0,${0.3 + Math.sin(elapsed * 0.02) * 0.15})`,
			);
			glow.addColorStop(1, "rgba(255,100,0,0)");
			ctx.fillStyle = glow;
			ctx.fillRect(cx - 30, cy - spriteH / 2 - 40, 80, 60);
		} else {
			if (!exploded) {
				exploded = true;
				applyShake(document.documentElement);
				for (const p of particles) {
					const dx = p.x + p.size / 2 - cx;
					const dy = p.y + p.size / 2 - cy;
					const dist = Math.sqrt(dx * dx + dy * dy) || 1;
					const force = 8 + Math.random() * 12;
					p.vx = (dx / dist) * force + (Math.random() - 0.5) * 6;
					p.vy = (dy / dist) * force + (Math.random() - 0.5) * 6 - 4;
					p.vz = -20 + Math.random() * 40;
				}
				confetti({
					particleCount: 80,
					spread: 360,
					startVelocity: 35,
					gravity: 1.2,
					colors: ["#f97316", "#fbbf24", "#ef4444", "#333", "#555"],
					origin: { x: 0.5, y: 0.5 },
					scalar: 0.8,
				});
			}
			const age = elapsed - fuseTime;
			if (age < 100) {
				ctx.fillStyle = `rgba(255,220,150,${(1 - age / 100) * 0.6})`;
				ctx.fillRect(0, 0, w, h);
			}
			if (age < 500) {
				ctx.beginPath();
				ctx.arc(cx, cy, age * 0.8, 0, Math.PI * 2);
				ctx.strokeStyle = `rgba(255,180,50,${(1 - age / 500) * 0.4})`;
				ctx.lineWidth = 4 - (age / 500) * 3;
				ctx.stroke();
			}
			for (const p of particles) {
				if (!p.alive) continue;
				p.vy += 0.6;
				p.vx *= 0.97;
				p.vz *= 0.97;
				p.x += p.vx;
				p.y += p.vy;
				p.z += p.vz;
				if (p.y > h + 100 || p.x < -100 || p.x > w + 100) {
					p.alive = false;
					continue;
				}
				const scale = Math.max(0, 1 + p.z / 200);
				const drawSize = p.size * scale;
				const alpha = Math.max(0, 1 - age / 2000);
				ctx.save();
				ctx.globalAlpha = alpha;
				ctx.translate(p.x + p.size / 2, p.y + p.size / 2);
				ctx.rotate(Math.sin(p.vx * 0.1) + Math.cos(p.vy * 0.1));
				ctx.fillStyle = p.color;
				ctx.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);
				ctx.restore();
			}
		}
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}

// ── Explosions: dense bursts across screen ───────────────────────────────────

interface Burst {
	x: number;
	y: number;
	t: number;
	life: number;
	maxR: number;
	hue: number;
}

export function effectExplosions() {
	const duration = 2500;
	const { ctx, w, h } = canvasOverlay(duration + 200);

	const bursts: Burst[] = [];
	for (let i = 0; i < 50; i++) {
		bursts.push({
			x: Math.random() * w,
			y: Math.random() * h,
			t: Math.random() * 1800,
			life: 300 + Math.random() * 400,
			maxR: 20 + Math.random() * 35,
			hue: Math.random() * 60 + 10,
		});
	}

	const start = performance.now();
	const frame = () => {
		const elapsed = performance.now() - start;
		if (elapsed > duration) return;
		ctx.clearRect(0, 0, w, h);

		for (const b of bursts) {
			const age = elapsed - b.t;
			if (age < 0 || age > b.life) continue;
			const p = age / b.life;
			const r = b.maxR * easeOutQuad(Math.min(p * 1.5, 1));
			const a = 1 - easeInQuad(p);

			const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
			grad.addColorStop(0, `hsla(${b.hue},100%,85%,${a * 0.9})`);
			grad.addColorStop(0.3, `hsla(${b.hue},100%,60%,${a * 0.7})`);
			grad.addColorStop(0.6, `hsla(${b.hue - 10},100%,45%,${a * 0.4})`);
			grad.addColorStop(1, `hsla(${b.hue - 20},100%,30%,0)`);
			ctx.beginPath();
			ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
			ctx.fillStyle = grad;
			ctx.fill();

			if (p < 0.5) {
				const cr = r * 0.3;
				const cg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, cr);
				cg.addColorStop(0, `rgba(255,255,255,${(1 - p * 2) * 0.8})`);
				cg.addColorStop(1, "rgba(255,200,100,0)");
				ctx.beginPath();
				ctx.arc(b.x, b.y, cr, 0, Math.PI * 2);
				ctx.fillStyle = cg;
				ctx.fill();
			}

			if (p < 0.7) {
				for (let s = 0; s < 6; s++) {
					const angle = (Math.PI * 2 * s) / 6 + b.hue;
					const sd = r * (0.8 + p * 0.6);
					ctx.beginPath();
					ctx.arc(
						b.x + Math.cos(angle) * sd,
						b.y + Math.sin(angle) * sd,
						1.5 + (1 - p) * 2,
						0,
						Math.PI * 2,
					);
					ctx.fillStyle = `hsla(${b.hue + 20},100%,70%,${a * 0.6})`;
					ctx.fill();
				}
			}
		}
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
	setTimeout(() => applyShake(document.documentElement), 400);
}

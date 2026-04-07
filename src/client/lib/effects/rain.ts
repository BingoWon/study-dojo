/** Gloomy cloud + rain effect — cloud with face drifts in, rain pours, then fades out. */

import { domOverlay } from "./helpers";

export function effectRain() {
	const duration = 5000;
	const container = domOverlay(
		"display:flex;justify-content:center;padding-top:10vh;",
		duration,
	);

	// Cloud group
	const cloud = document.createElement("div");
	cloud.style.cssText = `
		position:relative;width:210px;height:70px;
		background:#fff;border-radius:100px;
		animation:rain-cloud-in 0.6s ease-out both;
	`;

	// Cloud bumps
	const bumps: [string, string, string][] = [
		["-50px", "32px", "100px"],
		["-30px", "122px", "50px"],
	];
	for (const [top, left, size] of bumps) {
		const bump = document.createElement("div");
		bump.style.cssText = `
			position:absolute;background:#fff;border-radius:50%;
			top:${top};left:${left};width:${size};height:${size};
		`;
		cloud.appendChild(bump);
	}

	// Face
	const face = document.createElement("div");
	face.style.cssText = "position:absolute;top:10px;left:-7px;z-index:2;";

	// Eyes
	const eyeL = document.createElement("div");
	eyeL.style.cssText = `
		position:absolute;top:14px;left:80px;
		width:7px;height:7px;background:#666;border-radius:50%;
	`;
	const eyeR = document.createElement("div");
	eyeR.style.cssText = `
		position:absolute;top:14px;left:140px;
		width:7px;height:7px;background:#666;border-radius:50%;
	`;

	// Mouth (sad)
	const mouth = document.createElement("div");
	mouth.style.cssText = `
		position:absolute;top:28px;left:108px;
		width:7px;height:7px;
		border:3px solid;border-color:#666 #666 transparent transparent;
		border-radius:50%;transform:rotate(-45deg);
	`;

	face.appendChild(eyeL);
	face.appendChild(eyeR);
	face.appendChild(mouth);
	cloud.appendChild(face);
	container.appendChild(cloud);

	// Spawn raindrops over time
	const dropCount = 60;
	let spawned = 0;
	const spawnInterval = setInterval(() => {
		if (spawned >= dropCount) {
			clearInterval(spawnInterval);
			return;
		}
		const drop = document.createElement("div");
		const x = Math.random() * 200;
		const delay = Math.random() * 0.3;
		const speed = 1.2 + Math.random() * 1;
		drop.style.cssText = `
			position:absolute;left:${x}px;top:70px;z-index:1;
			width:12px;height:12px;
			background:#79C7C5;
			border-radius:0 50% 50% 50%;
			transform:rotate(45deg);
			opacity:0;
			animation:rain-drop ${speed}s ${delay}s ease-in forwards;
		`;
		cloud.appendChild(drop);
		setTimeout(() => drop.remove(), (speed + delay) * 1000 + 100);
		spawned++;
	}, 60);

	// Fade out
	setTimeout(() => {
		container.style.transition = "opacity 0.8s ease-out";
		container.style.opacity = "0";
	}, duration - 1000);
}

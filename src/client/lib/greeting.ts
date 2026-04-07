import type { PersonaId } from "../../worker/model";
import { PERSONAS } from "../../worker/model";

/** Cycle through an array sequentially using localStorage. */
function cycle<T>(items: T[], key: string): T {
	let idx = 0;
	try {
		const saved = localStorage.getItem(key);
		if (saved !== null) idx = (Number(saved) + 1) % items.length;
	} catch {}
	try {
		localStorage.setItem(key, String(idx));
	} catch {}
	return items[idx];
}

/** Get next greeting text for voice mode (sequential cycling). */
export function getNextVoiceGreeting(persona: PersonaId): string {
	return cycle(PERSONAS[persona].firstMessages, `greeting:voice:${persona}`)
		.text;
}

/** Get next placeholder text for input fields (sequential cycling). */
export function getNextPlaceholder(persona: PersonaId): string {
	return cycle(PERSONAS[persona].placeholders, `placeholder:${persona}`);
}

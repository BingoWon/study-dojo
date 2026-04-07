import type { PersonaId } from "../../worker/model";
import { PERSONAS } from "../../worker/model";

export interface Greeting {
	text: string;
	pose: string;
}

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

/** Get next greeting (text + pose) for a persona in a given mode. */
export function getNextGreeting(
	persona: PersonaId,
	mode: "voice" | "dialogue",
): Greeting {
	return cycle(PERSONAS[persona].firstMessages, `greeting:${mode}:${persona}`);
}

/** Get next placeholder text for a persona's input field. */
export function getNextPlaceholder(persona: PersonaId): string {
	return cycle(PERSONAS[persona].placeholders, `placeholder:${persona}`);
}

import type { PersonaId } from "../../worker/model";
import { PERSONAS } from "../../worker/model";

export interface Greeting {
	text: string;
	pose: string;
}

/**
 * Cycle through a persona's firstMessages sequentially.
 * Each mode (voice, dialogue) tracks its own index in localStorage.
 */
export function getNextGreeting(
	persona: PersonaId,
	mode: "voice" | "dialogue",
): Greeting {
	const messages = PERSONAS[persona].firstMessages;
	const key = `greeting:${mode}:${persona}`;
	let idx = 0;
	try {
		const saved = localStorage.getItem(key);
		if (saved !== null) idx = (Number(saved) + 1) % messages.length;
	} catch {}
	try {
		localStorage.setItem(key, String(idx));
	} catch {}
	return messages[idx];
}

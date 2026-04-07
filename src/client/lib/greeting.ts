import type { PersonaId } from "../../worker/model";
import { PERSONAS } from "../../worker/model";

/**
 * Cycle through a persona's firstMessages sequentially (not randomly).
 * Each mode (voice, dialogue) tracks its own index in localStorage.
 */
export function getNextGreeting(
	persona: PersonaId,
	mode: "voice" | "dialogue",
): string {
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

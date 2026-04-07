import { z } from "zod";

// ── Visual Effects ─────────────────────────────────────────────────────────

export const EFFECTS = ["confetti", "screen-shake", "flash"] as const;

export type Effect = (typeof EFFECTS)[number];

// ── Dialogue Turn Schema (built dynamically per persona) ───────────────────

/** Build the dialogue turn Zod schema with persona-specific poses. */
export function buildDialogueTurnSchema(poses: [string, ...string[]]) {
	return z.object({
		pose: z.enum(poses).describe("Character pose for portrait display"),
		preEffect: z
			.enum(EFFECTS)
			.optional()
			.describe("Visual effect before speech"),
		speech: z.string().describe("Plain text dialogue, no markdown"),
		postEffect: z
			.enum(EFFECTS)
			.optional()
			.describe("Visual effect after speech"),
		choices: z
			.array(z.string())
			.min(1)
			.max(3)
			.describe("1-3 response options for the user"),
	});
}

export type DialogueTurn = z.infer<ReturnType<typeof buildDialogueTurnSchema>>;

// ── Conversation History (sent to backend) ─────────────────────────────────

export interface DialogueHistoryEntry {
	role: "assistant" | "user";
	speech: string;
}

import { z } from "zod";

// ── Visual Effects ─────────────────────────────────────────────────────────

export const EFFECTS = [
	// Particle effects (canvas-confetti)
	"confetti",
	"fireworks",
	"stars",
	"hearts",
	"school-pride",
	// Cinematic full-screen effects
	"flash",
	"screen-shake",
	"bomb",
	"explosions",
	"lightning",
	"vortex",
	"glitch",
	// Atmospheric
	"rain",
	// Text celebration
	"good-job",
	// Panel-specific
	"panel-shake",
] as const;

export type Effect = (typeof EFFECTS)[number];

// ── Dialogue Turn Schema (built dynamically per persona) ───────────────────

/** Build the dialogue turn Zod schema with persona-specific poses. */
export function buildDialogueTurnSchema(poses: [string, ...string[]]) {
	return z.object({
		pose: z.enum(poses).describe("Character pose for portrait display"),
		preEffect: z
			.enum(EFFECTS)
			.nullable()
			.describe("Visual effect before speech, or null if none"),
		speech: z.string().describe("Plain text dialogue, no markdown"),
		postEffect: z
			.enum(EFFECTS)
			.nullable()
			.describe("Visual effect after speech, or null if none"),
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

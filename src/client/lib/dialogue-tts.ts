/**
 * Dialogue mode TTS — thin wrapper over the shared StreamingTTSPlayer.
 * Only adds a separate ElevenLabsTTSAdapter instance (intentionally independent
 * from RuntimeProvider's adapter — each mode manages its own voice lifecycle).
 */

import { ElevenLabsTTSAdapter } from "./elevenlabs-tts-adapter";
import { StreamingTTSPlayer } from "./tts-utils";

export const ttsAdapter = new ElevenLabsTTSAdapter({ endpoint: "/api/tts" });

/** Create a new streaming TTS player for dialogue mode. */
export function createDialogueTTSPlayer() {
	return new StreamingTTSPlayer(ttsAdapter.voiceParams);
}

// Re-export the class for type usage
export { StreamingTTSPlayer };

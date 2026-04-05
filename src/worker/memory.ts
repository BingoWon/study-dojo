import { log } from "./log";

const MEM0_BASE = "https://api.mem0.ai";

type Mem0Env = { MEM0_API_KEY: string };

// ── Types ───────────────────────────────────────────────────────────────────

export type MemoryItem = {
	id: string;
	memory: string;
	user_id?: string;
	categories?: string[] | null;
	score?: number;
	created_at: string;
	updated_at: string;
};

// ── Internal fetch helper ───────────────────────────────────────────────────

async function mem0Fetch<T>(
	env: Mem0Env,
	path: string,
	init?: RequestInit,
): Promise<T> {
	const res = await fetch(`${MEM0_BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Token ${env.MEM0_API_KEY}`,
			"Content-Type": "application/json",
			...init?.headers,
		},
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Mem0 ${res.status}: ${text}`);
	}
	return res.json() as Promise<T>;
}

// ── Search relevant memories (v1 — returns bare array) ──────────────────────

export async function searchMemories(
	env: Mem0Env,
	query: string,
	userId: string,
): Promise<MemoryItem[]> {
	try {
		return await mem0Fetch<MemoryItem[]>(env, "/v1/memories/search/", {
			method: "POST",
			body: JSON.stringify({ query, user_id: userId }),
		});
	} catch (e) {
		log.warn({
			module: "memory",
			msg: "search failed",
			error: (e as Error).message,
		});
		return [];
	}
}

// ── Add memories from conversation (async — returns PENDING status) ─────────

export async function addMemories(
	env: Mem0Env,
	messages: { role: string; content: string }[],
	userId: string,
): Promise<void> {
	try {
		await mem0Fetch(env, "/v1/memories/", {
			method: "POST",
			body: JSON.stringify({ messages, user_id: userId }),
		});
		// API returns PENDING status; memories are extracted asynchronously
	} catch (e) {
		log.warn({
			module: "memory",
			msg: "add failed",
			error: (e as Error).message,
		});
	}
}

// ── List all memories for a user (returns bare array) ───────────────────────

export async function listMemories(
	env: Mem0Env,
	userId: string,
): Promise<MemoryItem[]> {
	try {
		return await mem0Fetch<MemoryItem[]>(
			env,
			`/v1/memories/?user_id=${encodeURIComponent(userId)}`,
		);
	} catch (e) {
		log.warn({
			module: "memory",
			msg: "list failed",
			error: (e as Error).message,
		});
		return [];
	}
}

// ── Delete a single memory ──────────────────────────────────────────────────

export async function deleteMemory(
	env: Mem0Env,
	memoryId: string,
): Promise<void> {
	await mem0Fetch(env, `/v1/memories/${memoryId}/`, { method: "DELETE" });
}

// ── Format memories into system prompt segment ──────────────────────────────

export function formatMemoriesForPrompt(memories: MemoryItem[]): string {
	if (memories.length === 0) return "";
	const lines = memories.map((m) => `- ${m.memory}`).join("\n");
	return `\n\n以下是关于当前用户的记忆，在回答时优先参考，但不要直接提及"记忆"这个词：\n${lines}`;
}

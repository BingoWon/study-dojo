import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	DEFAULT_PERSONA,
	DEFAULT_THREAD_TITLE,
	isValidPersona,
	type PersonaId,
} from "./model";
import { messages, threads } from "./schema";

export function createDb(d1: D1Database) {
	return drizzle(d1);
}

export type DbClient = ReturnType<typeof createDb>;

// ── Threads ───────────────────────────────────────────────────────────────────

export async function getThreadsByUserId(db: DbClient, userId: string) {
	return db
		.select({
			id: threads.id,
			title: threads.title,
			persona: threads.persona,
			createdAt: threads.createdAt,
			updatedAt: threads.updatedAt,
		})
		.from(threads)
		.where(eq(threads.userId, userId))
		.orderBy(desc(threads.updatedAt));
}

export async function ensureThread(
	db: DbClient,
	id: string,
	userId: string,
	opts?: { persona?: PersonaId },
) {
	const now = Math.floor(Date.now() / 1000);
	await db
		.insert(threads)
		.values({
			id,
			userId,
			title: DEFAULT_THREAD_TITLE,
			persona:
				opts?.persona && isValidPersona(opts.persona)
					? opts.persona
					: DEFAULT_PERSONA,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({ target: threads.id });
}

export async function deleteThread(db: DbClient, id: string, userId: string) {
	return db
		.delete(threads)
		.where(and(eq(threads.id, id), eq(threads.userId, userId)));
}

export async function updateThreadTitle(
	db: DbClient,
	id: string,
	userId: string,
	title: string,
) {
	const now = Math.floor(Date.now() / 1000);
	return db
		.update(threads)
		.set({ title, updatedAt: now })
		.where(and(eq(threads.id, id), eq(threads.userId, userId)));
}

export async function updateThreadPersona(
	db: DbClient,
	id: string,
	userId: string,
	persona: PersonaId,
) {
	const now = Math.floor(Date.now() / 1000);
	return db
		.update(threads)
		.set({ persona, updatedAt: now })
		.where(and(eq(threads.id, id), eq(threads.userId, userId)));
}

export async function getThread(db: DbClient, id: string) {
	const [row] = await db
		.select()
		.from(threads)
		.where(eq(threads.id, id))
		.limit(1);
	return row ?? null;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getMessagesByThreadId(db: DbClient, threadId: string) {
	return db
		.select()
		.from(messages)
		.where(eq(messages.threadId, threadId))
		.orderBy(asc(messages.createdAt));
}

export async function saveMessages(
	db: DbClient,
	msgs: Array<{
		id: string;
		threadId: string;
		role: string;
		parts: unknown;
		createdAt: number;
	}>,
) {
	if (msgs.length === 0) return;
	await db
		.insert(messages)
		.values(msgs)
		.onConflictDoUpdate({
			target: messages.id,
			set: { parts: sql`excluded.parts` },
		});
}

export async function touchThread(db: DbClient, id: string, userId: string) {
	const now = Math.floor(Date.now() / 1000);
	return db
		.update(threads)
		.set({ updatedAt: now })
		.where(and(eq(threads.id, id), eq(threads.userId, userId)));
}

/**
 * Quota monitor — runs every 10 minutes via Cron Trigger.
 * Checks OpenRouter credits and ElevenLabs character usage.
 * Sends a Telegram alert when usage increases by >1% of total quota.
 */

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ── Schema ──────────────────────────────────────────────────────────────────

export const quotaSnapshots = sqliteTable("quota_snapshots", {
	service: text("service").primaryKey(),
	used: integer("used").notNull(), // stored as integer (cents or chars)
	total: integer("total").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

// ── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegram(
	token: string,
	chatId: string,
	text: string,
): Promise<void> {
	await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			chat_id: chatId,
			text,
			parse_mode: "Markdown",
		}),
	});
}

// ── Service Checkers ────────────────────────────────────────────────────────

interface Snapshot {
	service: string;
	used: number;
	total: number;
	label: string;
}

async function checkOpenRouter(apiKey: string): Promise<Snapshot | null> {
	try {
		const [authRes, creditsRes] = await Promise.all([
			fetch("https://openrouter.ai/api/v1/auth/key", {
				headers: { Authorization: `Bearer ${apiKey}` },
			}),
			fetch("https://openrouter.ai/api/v1/credits", {
				headers: { Authorization: `Bearer ${apiKey}` },
			}),
		]);

		if (!authRes.ok) return null;
		const auth = (await authRes.json()) as {
			data: { usage?: number; limit?: number };
		};

		let totalCredits = auth.data.limit ?? 0;
		let usedCredits = auth.data.usage ?? 0;

		if (creditsRes.ok) {
			const credits = (await creditsRes.json()) as {
				data: { total_credits?: number; total_usage?: number };
			};
			if (credits.data.total_credits != null)
				totalCredits = credits.data.total_credits;
			if (credits.data.total_usage != null)
				usedCredits = credits.data.total_usage;
		}

		// Store as cents (integer) for precision
		return {
			service: "openrouter",
			used: Math.round(usedCredits * 10000),
			total: Math.round(totalCredits * 10000),
			label: `OpenRouter: $${usedCredits.toFixed(4)} / $${totalCredits}`,
		};
	} catch {
		return null;
	}
}

async function checkElevenLabs(apiKey: string): Promise<Snapshot | null> {
	try {
		const res = await fetch(
			"https://api.elevenlabs.io/v1/user/subscription",
			{ headers: { "xi-api-key": apiKey } },
		);
		if (!res.ok) return null;
		const data = (await res.json()) as {
			character_count?: number;
			character_limit?: number;
		};
		return {
			service: "elevenlabs",
			used: data.character_count ?? 0,
			total: data.character_limit ?? 0,
			label: `ElevenLabs: ${(data.character_count ?? 0).toLocaleString()} / ${(data.character_limit ?? 0).toLocaleString()} 字符`,
		};
	} catch {
		return null;
	}
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function runMonitor(env: Env): Promise<void> {
	const botToken = env.TELEGRAM_BOT_TOKEN;
	const chatId = env.TELEGRAM_CHAT_ID;
	if (!botToken || !chatId) return;

	const db = drizzle(env.DB);
	const now = Math.floor(Date.now() / 1000);

	const checks: (Snapshot | null)[] = await Promise.all([
		env.LLM_API_KEY ? checkOpenRouter(env.LLM_API_KEY) : null,
		env.ELEVENLABS_API_KEY ? checkElevenLabs(env.ELEVENLABS_API_KEY) : null,
	]);

	const alerts: string[] = [];

	for (const snap of checks) {
		if (!snap || snap.total === 0) continue;

		// Read previous snapshot
		const [prev] = await db
			.select()
			.from(quotaSnapshots)
			.where(eq(quotaSnapshots.service, snap.service))
			.limit(1);

		const delta = prev ? snap.used - prev.used : 0;
		const pct = (delta / snap.total) * 100;

		// Alert if usage increased by >1% of total
		if (prev && pct > 1) {
			const usedPct = ((snap.used / snap.total) * 100).toFixed(1);
			alerts.push(
				`🔔 *${snap.label}*\n` +
					`   变化: +${pct.toFixed(2)}%（已用 ${usedPct}%）`,
			);
		}

		// Upsert snapshot
		await db
			.insert(quotaSnapshots)
			.values({
				service: snap.service,
				used: snap.used,
				total: snap.total,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: quotaSnapshots.service,
				set: { used: snap.used, total: snap.total, updatedAt: now },
			});
	}

	if (alerts.length > 0) {
		const msg = `⚡ *StudyDojo 额度变动*\n\n${alerts.join("\n\n")}`;
		await sendTelegram(botToken, chatId, msg);
	}
}

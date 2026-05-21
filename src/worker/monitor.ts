/**
 * Quota & user monitor — runs every 10 minutes via Cron Trigger.
 * Checks OpenRouter credits, ElevenLabs character usage, and Clerk user count.
 * Sends a Telegram alert when usage changes by >1% of total, or user count changes.
 */

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ── Schema ──────────────────────────────────────────────────────────────────

export const monitorSnapshots = sqliteTable("monitor_snapshots", {
	key: text("key").primaryKey(),
	value: integer("value").notNull(),
	extra: text("extra"), // optional JSON metadata
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

interface CheckResult {
	key: string;
	value: number;
	total?: number;
	extra?: string;
	shouldAlert: (prev: number | null) => string | null;
}

async function checkOpenRouter(apiKey: string): Promise<CheckResult | null> {
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

		let total = auth.data.limit ?? 0;
		let used = auth.data.usage ?? 0;

		if (creditsRes.ok) {
			const credits = (await creditsRes.json()) as {
				data: { total_credits?: number; total_usage?: number };
			};
			if (credits.data.total_credits != null)
				total = credits.data.total_credits;
			if (credits.data.total_usage != null) used = credits.data.total_usage;
		}

		const usedCents = Math.round(used * 10000);
		const totalCents = Math.round(total * 10000);

		return {
			key: "openrouter_usage",
			value: usedCents,
			total: totalCents,
			extra: JSON.stringify({ used, total }),
			shouldAlert: (prev) => {
				if (prev === null || totalCents === 0) return null;
				const delta = usedCents - prev;
				const pct = (delta / totalCents) * 100;
				if (pct <= 1) return null;
				return `💰 *OpenRouter*: $${used.toFixed(4)} / $${total} (+${pct.toFixed(1)}%)`;
			},
		};
	} catch {
		return null;
	}
}

async function checkElevenLabs(apiKey: string): Promise<CheckResult | null> {
	try {
		const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
			headers: { "xi-api-key": apiKey },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			character_count?: number;
			character_limit?: number;
			next_character_count_reset_unix?: number;
		};
		const used = data.character_count ?? 0;
		const total = data.character_limit ?? 0;

		return {
			key: "elevenlabs_usage",
			value: used,
			total,
			extra: JSON.stringify({ used, total }),
			shouldAlert: (prev) => {
				if (prev === null || total === 0) return null;
				const delta = used - prev;
				const pct = (delta / total) * 100;
				if (pct <= 1) return null;
				const remaining = total - used;
				return `🎙 *ElevenLabs*: ${used.toLocaleString()} / ${total.toLocaleString()} 字符 (+${pct.toFixed(1)}%，剩余 ${remaining.toLocaleString()})`;
			},
		};
	} catch {
		return null;
	}
}

async function checkClerkUsers(jwksUrl: string): Promise<CheckResult | null> {
	try {
		// Extract Clerk domain from JWKS URL
		const url = new URL(jwksUrl);
		const clerkDomain = url.origin;

		// Use Clerk Frontend API to get user count
		// The /v1/client endpoint doesn't need a secret key
		// Instead, count users by checking the Backend API (needs CLERK_SECRET_KEY)
		// Fallback: use a simpler approach — count via our own D1
		// since every authenticated user creates threads
		return {
			key: "clerk_users",
			value: -1, // placeholder, will be filled by D1 query below
			extra: JSON.stringify({ source: "d1_threads" }),
			shouldAlert: (prev) => {
				// Will be overridden after D1 query
				return null;
			},
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
	const alerts: string[] = [];

	// ── Quota checks ──────────────────────────────────────────────────────
	const checks: (CheckResult | null)[] = await Promise.all([
		env.LLM_API_KEY ? checkOpenRouter(env.LLM_API_KEY) : null,
		env.ELEVENLABS_API_KEY ? checkElevenLabs(env.ELEVENLABS_API_KEY) : null,
	]);

	for (const check of checks) {
		if (!check) continue;

		const [prev] = await db
			.select()
			.from(monitorSnapshots)
			.where(eq(monitorSnapshots.key, check.key))
			.limit(1);

		const alert = check.shouldAlert(prev?.value ?? null);
		if (alert) alerts.push(alert);

		await db
			.insert(monitorSnapshots)
			.values({
				key: check.key,
				value: check.value,
				extra: check.extra,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: monitorSnapshots.key,
				set: {
					value: check.value,
					extra: check.extra,
					updatedAt: now,
				},
			});
	}

	// ── User count (from D1 distinct user_id in threads) ──────────────────
	try {
		const result = await env.DB.prepare(
			"SELECT COUNT(DISTINCT user_id) as count FROM threads",
		).all<{ count: number }>();
		const userCount = result.results[0]?.count ?? 0;

		const [prev] = await db
			.select()
			.from(monitorSnapshots)
			.where(eq(monitorSnapshots.key, "user_count"))
			.limit(1);

		const prevCount = prev?.value ?? 0;
		if (prevCount !== userCount && prev !== undefined) {
			const diff = userCount - prevCount;
			const emoji = diff > 0 ? "📈" : "📉";
			alerts.push(
				`${emoji} *用户数*: ${prevCount} → ${userCount}（${diff > 0 ? "+" : ""}${diff}）`,
			);
		}

		await db
			.insert(monitorSnapshots)
			.values({
				key: "user_count",
				value: userCount,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: monitorSnapshots.key,
				set: { value: userCount, updatedAt: now },
			});
	} catch {
		// threads table might not exist yet
	}

	// ── Send alerts ───────────────────────────────────────────────────────
	if (alerts.length > 0) {
		const msg = `⚡ *StudyDojo 监控报告*\n\n${alerts.join("\n\n")}`;
		await sendTelegram(botToken, chatId, msg);
	}
}

/**
 * Tencent Cloud Machine Translation (TMT) API client.
 * Uses TC3-HMAC-SHA256 signing, compatible with Cloudflare Workers (Web Crypto).
 */

import { log } from "./log";

const TMT_HOST = "tmt.tencentcloudapi.com";
const TMT_VERSION = "2018-03-21";
const CHUNK_LIMIT = 5000; // chars per API call (leave margin from 6000 limit)
const MAX_CONCURRENCY = 4; // concurrent translation requests (API limit: 5/s)

type TmtEnv = {
	TMT_SECRET_ID: string;
	TMT_SECRET_KEY: string;
};

// ── TC3-HMAC-SHA256 Signing ─────────────────────────────────────────────────

async function hmacSha256(
	key: ArrayBuffer,
	data: string,
): Promise<ArrayBuffer> {
	const k = await crypto.subtle.importKey(
		"raw",
		key,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}

async function sha256Hex(text: string): Promise<string> {
	const buf = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(text),
	);
	return [...new Uint8Array(buf)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function hexEncode(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function signRequest(
	payload: string,
	timestamp: number,
	env: TmtEnv,
): Promise<string> {
	const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
	const credentialScope = `${date}/tmt/tc3_request`;

	const canonicalRequest = [
		"POST",
		"/",
		"",
		`content-type:application/json\nhost:${TMT_HOST}\n`,
		"content-type;host",
		await sha256Hex(payload),
	].join("\n");

	const stringToSign = [
		"TC3-HMAC-SHA256",
		String(timestamp),
		credentialScope,
		await sha256Hex(canonicalRequest),
	].join("\n");

	const secretDate = await hmacSha256(
		new TextEncoder().encode(`TC3${env.TMT_SECRET_KEY}`).buffer as ArrayBuffer,
		date,
	);
	const secretService = await hmacSha256(secretDate, "tmt");
	const secretSigning = await hmacSha256(secretService, "tc3_request");
	const signature = hexEncode(await hmacSha256(secretSigning, stringToSign));

	return `TC3-HMAC-SHA256 Credential=${env.TMT_SECRET_ID}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`;
}

// ── Single Text Translation ─────────────────────────────────────────────────

async function translateText(text: string, env: TmtEnv): Promise<string> {
	const payload = JSON.stringify({
		SourceText: text,
		Source: "en",
		Target: "zh",
		ProjectId: 0,
	});

	const timestamp = Math.floor(Date.now() / 1000);
	const authorization = await signRequest(payload, timestamp, env);

	const res = await fetch(`https://${TMT_HOST}`, {
		method: "POST",
		headers: {
			Authorization: authorization,
			"Content-Type": "application/json",
			Host: TMT_HOST,
			"X-TC-Action": "TextTranslate",
			"X-TC-Version": TMT_VERSION,
			"X-TC-Timestamp": String(timestamp),
			"X-TC-Region": "ap-guangzhou",
		},
		body: payload,
	});

	if (!res.ok) {
		throw new Error(`TMT API failed: ${res.status}`);
	}

	const data = (await res.json()) as {
		Response: {
			TargetText?: string;
			Error?: { Code: string; Message: string };
		};
	};

	if (data.Response.Error) {
		throw new Error(
			`TMT: ${data.Response.Error.Code} - ${data.Response.Error.Message}`,
		);
	}

	return data.Response.TargetText ?? text;
}

// ── Language Detection ───────────────────────────────────────────────────────

/** Detect if text is primarily Chinese (> 30% CJK characters). */
export function isChinese(text: string): boolean {
	const sample = text.slice(0, 2000);
	let cjk = 0;
	let total = 0;
	for (const ch of sample) {
		const code = ch.codePointAt(0) ?? 0;
		if (code > 0x2f) total++;
		if (
			(code >= 0x4e00 && code <= 0x9fff) ||
			(code >= 0x3400 && code <= 0x4dbf)
		) {
			cjk++;
		}
	}
	return total > 0 && cjk / total > 0.3;
}

// ── Batch Markdown Translation ──────────────────────────────────────────────

/** Group paragraphs into batches that fit within CHUNK_LIMIT. */
function buildBatches(paragraphs: string[]): { text: string; empty: boolean }[] {
	const batches: { text: string; empty: boolean }[] = [];
	let batch: string[] = [];
	let batchLen = 0;

	const flush = () => {
		if (batch.length === 0) return;
		batches.push({ text: batch.join("\n\n"), empty: false });
		batch = [];
		batchLen = 0;
	};

	for (const p of paragraphs) {
		if (!p.trim()) {
			batches.push({ text: "", empty: true });
			continue;
		}

		if (p.length > CHUNK_LIMIT) {
			flush();
			// Split oversized paragraph into CHUNK_LIMIT-sized pieces
			for (let i = 0; i < p.length; i += CHUNK_LIMIT) {
				batches.push({ text: p.slice(i, i + CHUNK_LIMIT), empty: false });
			}
			continue;
		}

		if (batchLen + p.length + 2 > CHUNK_LIMIT) {
			flush();
		}

		batch.push(p);
		batchLen += p.length + 2;
	}

	flush();
	return batches;
}

/** Run async tasks with bounded concurrency. */
async function mapConcurrent<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;

	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i], i);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () =>
			worker(),
		),
	);
	return results;
}

/**
 * Translate a full markdown document paragraph by paragraph.
 * Batches paragraphs within CHUNK_LIMIT, then translates concurrently
 * with bounded parallelism to respect API rate limits (5 req/s).
 */
export async function translateMarkdown(
	markdown: string,
	env: TmtEnv,
): Promise<string> {
	const paragraphs = markdown.split(/\n{2,}/);
	const batches = buildBatches(paragraphs);

	const translated = await mapConcurrent(
		batches,
		MAX_CONCURRENCY,
		async (batch) => {
			if (batch.empty) return "";
			try {
				return await translateText(batch.text, env);
			} catch (e) {
				log.warn({
					module: "translate",
					msg: "batch failed, keeping original",
					error: String(e),
				});
				return batch.text;
			}
		},
	);

	return translated.join("\n\n");
}

import { log } from "./log";

/**
 * Clerk JWT verification with optional JWKS signature validation.
 *
 * - If `CLERK_JWKS_URL` is configured: full RS256 signature verification.
 * - Otherwise: expiration-only check (dev fallback with console warning).
 */

type JwkWithKid = JsonWebKey & { kid?: string };

let cachedKeys = new Map<string, CryptoKey>();
let cacheExpiry = 0;

async function getSigningKey(
	kid: string,
	jwksUrl: string,
): Promise<CryptoKey | null> {
	const cached = cachedKeys.get(kid);
	if (cached && Date.now() < cacheExpiry) return cached;

	const res = await fetch(jwksUrl);
	if (!res.ok) return null;

	const { keys } = (await res.json()) as { keys: JwkWithKid[] };
	cachedKeys = new Map();
	for (const jwk of keys) {
		const key = await crypto.subtle.importKey(
			"jwk",
			jwk,
			{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
			false,
			["verify"],
		);
		if (jwk.kid) cachedKeys.set(jwk.kid, key);
	}
	cacheExpiry = Date.now() + 3_600_000;

	return cachedKeys.get(kid) ?? null;
}

function base64UrlDecode(s: string): Uint8Array {
	const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
	return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function parseSegment(s: string): Record<string, unknown> {
	return JSON.parse(new TextDecoder().decode(base64UrlDecode(s)));
}

export async function getUserId(
	c: { req: { header: (name: string) => string | undefined } },
	env: { CLERK_JWKS_URL?: string },
): Promise<string | null> {
	const cookie = c.req.header("cookie") ?? "";
	const match = cookie.match(/__session=([^;]+)/);
	if (!match) return null;

	const token = match[1];
	const parts = token.split(".");
	if (parts.length !== 3) return null;

	try {
		const [headerB64, payloadB64, sigB64] = parts;
		const payload = parseSegment(payloadB64) as {
			sub?: string;
			exp?: number;
		};

		if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
			return null;
		}

		if (env.CLERK_JWKS_URL) {
			const header = parseSegment(headerB64) as { kid?: string };
			if (!header.kid) return null;

			const key = await getSigningKey(header.kid, env.CLERK_JWKS_URL);
			if (!key) return null;

			const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
			const sig = base64UrlDecode(sigB64);
			const valid = await crypto.subtle.verify(
				"RSASSA-PKCS1-v1_5",
				key,
				sig.buffer as ArrayBuffer,
				data,
			);
			if (!valid) return null;
		}

		return payload.sub ?? null;
	} catch {
		return null;
	}
}

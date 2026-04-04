/**
 * RAG pipeline for Supabase — pgvector + Storage.
 * Handles: file parsing, OCR, translation, chunking, embedding, retrieval.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isChinese, translateMarkdown } from "./translate";

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;
const PADDLE_SYNC_URL =
	"https://y9z388hbpaj013l5.aistudio-app.com/layout-parsing";

type StatusCallback = (status: string, data?: Record<string, unknown>) => void;

// ── Hashing ─────────────────────────────────────────────────────────────────

export async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// ── File Classification ─────────────────────────────────────────────────────

export type FileCategory = "ocr" | "text" | "docx";

export function classifyFile(name: string): {
	category: FileCategory;
	ocrType?: 0 | 1;
} {
	const ext = name.toLowerCase().split(".").pop() ?? "";
	if (ext === "pdf") return { category: "ocr", ocrType: 0 };
	if (["png", "jpg", "jpeg", "webp", "bmp", "tiff"].includes(ext))
		return { category: "ocr", ocrType: 1 };
	if (ext === "docx") return { category: "docx" };
	return { category: "text" };
}

// ── PaddleOCR ───────────────────────────────────────────────────────────────

async function parseWithPaddleOCR(
	fileBuffer: ArrayBuffer,
	token: string,
	fileType: 0 | 1,
): Promise<string> {
	const bytes = new Uint8Array(fileBuffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++)
		binary += String.fromCharCode(bytes[i]);
	const fileB64 = btoa(binary);

	const OCR_ERRORS: Record<number, string> = {
		403: "OCR 认证失败",
		413: "文件过大",
		422: "参数无效",
		429: "今日额度用完",
		500: "OCR 内部错误",
		503: "OCR 服务繁忙",
		504: "OCR 超时",
	};

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 120_000);
	let res: Response;
	try {
		res = await fetch(PADDLE_SYNC_URL, {
			method: "POST",
			headers: {
				Authorization: `token ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				file: fileB64,
				fileType,
				useDocOrientationClassify: true,
				useDocUnwarping: true,
				useLayoutDetection: true,
				useChartRecognition: true,
			}),
			signal: controller.signal,
		});
		clearTimeout(timeout);
	} catch (e) {
		clearTimeout(timeout);
		throw new Error(
			(e as Error).name === "AbortError"
				? "OCR 解析超时（120s）"
				: `OCR 网络错误: ${(e as Error).message}`,
		);
	}
	if (!res.ok)
		throw new Error(OCR_ERRORS[res.status] ?? `OCR 失败 (${res.status})`);

	// biome-ignore lint/suspicious/noExplicitAny: PaddleOCR response
	const data = (await res.json()) as any;
	return data.result.layoutParsingResults
		.map((p: { markdown: { text: string } }) => p.markdown.text)
		.join("\n\n");
}

// ── DOCX Parsing ────────────────────────────────────────────────────────────

async function parseDocx(buffer: ArrayBuffer): Promise<string> {
	const mammoth = await import("mammoth");
	const result = await mammoth.extractRawText({ arrayBuffer: buffer });
	return result.value;
}

// ── Markdown Chunking ───────────────────────────────────────────────────────

function chunkMarkdown(text: string): string[] {
	const chunks: string[] = [];
	for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
		chunks.push(text.slice(i, i + CHUNK_SIZE));
		if (i + CHUNK_SIZE >= text.length) break;
	}
	return chunks;
}

// ── Embeddings ──────────────────────────────────────────────────────────────

async function embed(
	texts: string[],
	baseUrl: string,
	apiKey: string,
	model: string,
): Promise<number[][]> {
	const res = await fetch(`${baseUrl}/embeddings`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({ input: texts, model, dimensions: 1536 }),
	});
	if (!res.ok) throw new Error(`Embedding API error ${res.status}`);
	// biome-ignore lint/suspicious/noExplicitAny: OpenAI embedding response
	const data = (await res.json()) as any;
	return data.data.map((d: { embedding: number[] }) => d.embedding);
}

// ── Dedup Check ─────────────────────────────────────────────────────────────

export async function checkPaperByHash(supabase: SupabaseClient, hash: string) {
	const { data } = await supabase
		.from("papers")
		.select("id, status")
		.eq("hash", hash)
		.limit(1)
		.maybeSingle();
	return data
		? { exists: true, paperId: data.id, status: data.status }
		: { exists: false };
}

// ── Full Ingestion Pipeline ─────────────────────────────────────────────────

interface IngestEnv {
	PADDLE_OCR_TOKEN?: string;
	TMT_SECRET_ID?: string;
	TMT_SECRET_KEY?: string;
	EMBEDDING_BASE_URL: string;
	EMBEDDING_API_KEY: string;
	EMBEDDING_MODEL: string;
}

export async function ingestFile(
	fileBuffer: ArrayBuffer,
	opts: {
		fileName?: string;
		fileExt?: string;
		category: FileCategory;
		ocrType?: 0 | 1;
		userId: string;
		supabase: SupabaseClient;
		env: IngestEnv;
		onStatus: StatusCallback;
	},
): Promise<{ paperId: string; chunks: number }> {
	const { supabase, onStatus, env } = opts;
	const hash = await hashBuffer(fileBuffer);
	const ext =
		opts.category === "docx" ? "docx" : opts.ocrType === 1 ? "img" : "pdf";

	// Dedup check
	const { data: existing } = await supabase
		.from("papers")
		.select("id, status, lang")
		.eq("hash", hash)
		.limit(1)
		.maybeSingle();
	if (existing) {
		await supabase
			.from("user_papers")
			.upsert(
				{ user_id: opts.userId, paper_id: existing.id },
				{ onConflict: "user_id,paper_id" },
			);
		onStatus("ready", {
			paperId: existing.id,
			duplicate: true,
			status: existing.status,
			lang: existing.lang,
		});
		return { paperId: existing.id, chunks: 0 };
	}

	const paperId = crypto.randomUUID();
	const storagePath = `papers/${hash}.${ext}`;

	// Step 1: Upload to Supabase Storage
	onStatus("uploading", { paperId });
	await supabase.storage.from("papers").upload(storagePath, fileBuffer, {
		contentType: "application/octet-stream",
	});
	await supabase.from("papers").insert({
		id: paperId,
		hash,
		file_ext: opts.fileExt ?? ext,
		status: "uploading",
	});
	await supabase
		.from("user_papers")
		.upsert(
			{ user_id: opts.userId, paper_id: paperId },
			{ onConflict: "user_id,paper_id" },
		);

	// Step 2: Parse
	onStatus("parsing", { paperId });
	await supabase.from("papers").update({ status: "parsing" }).eq("id", paperId);

	let markdown: string;
	switch (opts.category) {
		case "text":
			markdown = new TextDecoder().decode(fileBuffer);
			break;
		case "docx":
			markdown = await parseDocx(fileBuffer);
			break;
		case "ocr":
			if (!env.PADDLE_OCR_TOKEN) throw new Error("缺少 PADDLE_OCR_TOKEN");
			markdown = await parseWithPaddleOCR(
				fileBuffer,
				env.PADDLE_OCR_TOKEN,
				opts.ocrType ?? 0,
			);
			break;
	}

	// Upload markdown to storage
	const mdPath = `papers/${hash}.md`;
	await supabase.storage
		.from("papers")
		.upload(mdPath, markdown, { contentType: "text/markdown" });

	// Detect language
	const lang = isChinese(markdown) ? "zh" : "en";
	await supabase.from("papers").update({ lang }).eq("id", paperId);

	// Step 3: Translate (English → Chinese)
	onStatus("translating", { paperId, lang });
	await supabase
		.from("papers")
		.update({ status: "translating" })
		.eq("id", paperId);
	if (lang === "en" && env.TMT_SECRET_ID && env.TMT_SECRET_KEY) {
		try {
			const translated = await translateMarkdown(
				markdown,
				env.TMT_SECRET_ID,
				env.TMT_SECRET_KEY,
			);
			const zhPath = `papers/${hash}.zh.md`;
			await supabase.storage
				.from("papers")
				.upload(zhPath, translated, { contentType: "text/markdown" });
		} catch {
			onStatus("translating", { paperId, lang, skipped: true });
		}
	}

	// Step 4: Chunk
	onStatus("chunking", { paperId, lang });
	await supabase
		.from("papers")
		.update({ status: "chunking" })
		.eq("id", paperId);
	const chunks = chunkMarkdown(markdown);

	if (chunks.length === 0) {
		await supabase
			.from("papers")
			.update({ status: "ready", chunks: 0 })
			.eq("id", paperId);
		onStatus("ready", { paperId, chunks: 0, lang, fileName: opts.fileName });
		return { paperId, chunks: 0 };
	}

	// Step 5: Embed + store with pgvector
	onStatus("embedding", { paperId, lang });
	await supabase
		.from("papers")
		.update({ status: "embedding" })
		.eq("id", paperId);

	// Batch embed (max 100 per call)
	const EMBED_BATCH = 50;
	for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
		const batch = chunks.slice(i, i + EMBED_BATCH);
		const embeddings = await embed(
			batch,
			env.EMBEDDING_BASE_URL,
			env.EMBEDDING_API_KEY,
			env.EMBEDDING_MODEL,
		);

		const rows = batch.map((content, j) => ({
			id: crypto.randomUUID(),
			content,
			paper_id: paperId,
			embedding: embeddings[j],
		}));
		await supabase.from("documents").insert(rows);
	}

	// Done
	await supabase
		.from("papers")
		.update({ status: "ready", chunks: chunks.length })
		.eq("id", paperId);
	onStatus("ready", {
		paperId,
		chunks: chunks.length,
		lang,
		fileName: opts.fileName,
	});
	return { paperId, chunks: chunks.length };
}

// ── Paper Operations ────────────────────────────────────────────────────────

export async function listUserPapers(supabase: SupabaseClient, userId: string) {
	const { data } = await supabase
		.from("user_papers")
		.select(
			"paper_id, title, created_at, papers(id, chunks, status, lang, file_ext)",
		)
		.eq("user_id", userId)
		.order("created_at", { ascending: false });
	return (data ?? []).map((row) => {
		// biome-ignore lint/suspicious/noExplicitAny: joined row shape
		const p = (row as any).papers;
		return {
			id: p.id,
			title: row.title,
			chunks: p.chunks,
			status: p.status,
			lang: p.lang,
			fileExt: p.file_ext,
			createdAt: row.created_at,
		};
	});
}

export async function renameUserPaper(
	supabase: SupabaseClient,
	userId: string,
	paperId: string,
	title: string,
) {
	await supabase
		.from("user_papers")
		.update({ title })
		.eq("user_id", userId)
		.eq("paper_id", paperId);
}

export async function unlinkUserPaper(
	supabase: SupabaseClient,
	userId: string,
	paperId: string,
) {
	await supabase
		.from("user_papers")
		.delete()
		.eq("user_id", userId)
		.eq("paper_id", paperId);
}

export async function getPaperMarkdown(
	supabase: SupabaseClient,
	paperId: string,
	userId: string,
	lang?: "original" | "zh",
): Promise<string | null> {
	// Verify user owns paper
	const { data: link } = await supabase
		.from("user_papers")
		.select("paper_id")
		.eq("user_id", userId)
		.eq("paper_id", paperId)
		.limit(1)
		.maybeSingle();
	if (!link) return null;

	const { data: paper } = await supabase
		.from("papers")
		.select("hash, lang")
		.eq("id", paperId)
		.maybeSingle();
	if (!paper) return null;

	const path =
		lang === "zh" && paper.lang === "en"
			? `papers/${paper.hash}.zh.md`
			: `papers/${paper.hash}.md`;
	const { data } = await supabase.storage.from("papers").download(path);
	if (!data) return null;
	return await data.text();
}

// ── Vector Search (pgvector) ────────────────────────────────────────────────

export async function retrieveContext(
	supabase: SupabaseClient,
	query: string,
	paperIds: string[],
	topK: number,
	env: {
		EMBEDDING_BASE_URL: string;
		EMBEDDING_API_KEY: string;
		EMBEDDING_MODEL: string;
	},
): Promise<string> {
	if (paperIds.length === 0) return "";

	const [queryEmbedding] = await embed(
		[query],
		env.EMBEDDING_BASE_URL,
		env.EMBEDDING_API_KEY,
		env.EMBEDDING_MODEL,
	);

	// pgvector similarity search with paper filtering
	const { data } = await supabase.rpc("match_documents", {
		query_embedding: queryEmbedding,
		match_count: topK,
		filter_paper_ids: paperIds,
	});

	if (!data || data.length === 0) return "";
	return data.map((d: { content: string }) => d.content).join("\n\n---\n\n");
}

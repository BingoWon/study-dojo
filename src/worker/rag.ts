import { CloudflareVectorizeStore } from "@langchain/cloudflare";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { and, eq, inArray } from "drizzle-orm";
import type { DbClient } from "./db";
import { documents, papers, userPapers } from "./schema";

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;
const INSERT_BATCH = 15;
const DEFAULT_DIMENSIONS = 1536;

const PADDLE_JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs";
const PADDLE_MODEL = "PaddleOCR-VL-1.5";

type EmbeddingEnv = {
	EMBEDDING_BASE_URL: string;
	EMBEDDING_API_KEY: string;
	EMBEDDING_MODEL: string;
	EMBEDDING_DIMENSIONS?: string;
};

function createEmbeddings(env: EmbeddingEnv) {
	return new OpenAIEmbeddings({
		model: env.EMBEDDING_MODEL,
		dimensions: Number(env.EMBEDDING_DIMENSIONS) || DEFAULT_DIMENSIONS,
		apiKey: env.EMBEDDING_API_KEY,
		configuration: { baseURL: env.EMBEDDING_BASE_URL },
	});
}

function createVectorStore(
	vectorize: VectorizeIndex,
	embeddings: OpenAIEmbeddings,
) {
	return new CloudflareVectorizeStore(embeddings, { index: vectorize });
}

// ── Hashing ─────────────────────────────────────────────────────────────────

export async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// ── PaddleOCR Async API ─────────────────────────────────────────────────────

export async function submitOcrJob(
	pdfBuffer: ArrayBuffer,
	token: string,
): Promise<string> {
	const form = new FormData();
	form.append(
		"file",
		new Blob([pdfBuffer], { type: "application/pdf" }),
		"document.pdf",
	);
	form.append("model", PADDLE_MODEL);
	form.append(
		"optionalPayload",
		JSON.stringify({
			useDocOrientationClassify: false,
			useDocUnwarping: false,
			useChartRecognition: false,
		}),
	);

	const res = await fetch(PADDLE_JOB_URL, {
		method: "POST",
		headers: { Authorization: `bearer ${token}` },
		body: form,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`PaddleOCR submit failed (${res.status}): ${text}`);
	}
	const json = (await res.json()) as { data: { jobId: string } };
	return json.data.jobId;
}

export async function checkOcrJob(
	jobId: string,
	token: string,
): Promise<{
	state: "pending" | "running" | "done" | "failed";
	jsonUrl?: string;
	progress?: { totalPages: number; extractedPages: number };
	error?: string;
}> {
	const res = await fetch(`${PADDLE_JOB_URL}/${jobId}`, {
		headers: { Authorization: `bearer ${token}` },
	});
	if (!res.ok) throw new Error(`PaddleOCR check failed: ${res.status}`);

	const { data } = (await res.json()) as {
		data: {
			state: string;
			resultUrl?: { jsonUrl?: string };
			extractProgress?: { totalPages: number; extractedPages: number };
			errorMsg?: string;
		};
	};

	return {
		state: data.state as "pending" | "running" | "done" | "failed",
		jsonUrl: data.resultUrl?.jsonUrl,
		progress: data.extractProgress,
		error: data.errorMsg,
	};
}

export async function fetchOcrMarkdown(jsonlUrl: string): Promise<string> {
	const res = await fetch(jsonlUrl);
	if (!res.ok) throw new Error(`Failed to fetch OCR result: ${res.status}`);

	const lines = (await res.text()).trim().split("\n");
	const parts: string[] = [];

	for (const line of lines) {
		if (!line.trim()) continue;
		const { result } = JSON.parse(line) as {
			result: {
				layoutParsingResults: Array<{ markdown: { text: string } }>;
			};
		};
		for (const page of result.layoutParsingResults) {
			parts.push(page.markdown.text);
		}
	}

	return parts.join("\n\n");
}

// ── Ingest Markdown (chunks + vectorize for a paper) ────────────────────────

async function ingestMarkdown(
	markdown: string,
	opts: {
		source?: string;
		paperId: string;
		db: DbClient;
		vectorize: VectorizeIndex;
		env: EmbeddingEnv;
	},
): Promise<{ chunks: number }> {
	const splitter = new MarkdownTextSplitter({
		chunkSize: CHUNK_SIZE,
		chunkOverlap: CHUNK_OVERLAP,
	});
	const chunks = await splitter.splitText(markdown);
	if (chunks.length === 0) return { chunks: 0 };

	const ids = chunks.map(() => crypto.randomUUID());
	const now = Math.floor(Date.now() / 1000);

	const rows = chunks.map((content, i) => ({
		id: ids[i],
		content,
		source: opts.source ?? null,
		paperId: opts.paperId,
		createdAt: now,
	}));

	for (let i = 0; i < rows.length; i += INSERT_BATCH) {
		await opts.db.insert(documents).values(rows.slice(i, i + INSERT_BATCH));
	}

	const embeddings = createEmbeddings(opts.env);
	const store = createVectorStore(opts.vectorize, embeddings);

	const docs = chunks.map(
		(content, i) =>
			new Document({
				pageContent: content,
				metadata: {
					id: ids[i],
					paperId: opts.paperId,
				},
			}),
	);

	try {
		await store.addDocuments(docs, { ids });
	} catch (e) {
		console.warn(
			"[RAG] Vectorize indexing skipped (local dev):",
			(e as Error).message,
		);
	}

	return { chunks: chunks.length };
}

// ── Upload PDF: dedup by hash, link to user ─────────────────────────────────

/**
 * Upload a PDF: compute hash, dedup against existing papers, link to user.
 * Returns the paperId and whether OCR was triggered (isNew).
 */
export async function uploadPdf(
	pdfBuffer: ArrayBuffer,
	opts: {
		userId: string;
		db: DbClient;
		r2: R2Bucket;
		ocrToken: string;
	},
): Promise<{ paperId: string; isNew: boolean }> {
	const hash = await hashBuffer(pdfBuffer);
	const now = Math.floor(Date.now() / 1000);

	// Check if paper with this hash already exists
	const [existing] = await opts.db
		.select({ id: papers.id })
		.from(papers)
		.where(eq(papers.hash, hash))
		.limit(1);

	if (existing) {
		// Paper exists — just link user (ignore if already linked)
		await opts.db
			.insert(userPapers)
			.values({ userId: opts.userId, paperId: existing.id, createdAt: now })
			.onConflictDoNothing();
		return { paperId: existing.id, isNew: false };
	}

	// New paper — store PDF, submit OCR, insert record
	const paperId = crypto.randomUUID();
	const r2Key = `papers/${hash}.pdf`;

	await opts.r2.put(r2Key, pdfBuffer);
	const jobId = await submitOcrJob(pdfBuffer, opts.ocrToken);

	await opts.db.insert(papers).values({
		id: paperId,
		hash,
		r2Key,
		chunks: 0,
		status: "processing",
		jobId,
		createdAt: now,
	});

	// Link user
	await opts.db
		.insert(userPapers)
		.values({ userId: opts.userId, paperId, createdAt: now })
		.onConflictDoNothing();

	return { paperId, isNew: true };
}

// ── Finalize Paper (OCR done → markdown + chunks) ───────────────────────────

export async function finalizePaper(
	paperId: string,
	jsonlUrl: string,
	opts: {
		db: DbClient;
		r2: R2Bucket;
		vectorize: VectorizeIndex;
		env: EmbeddingEnv;
	},
): Promise<{ chunks: number }> {
	const [paper] = await opts.db
		.select()
		.from(papers)
		.where(eq(papers.id, paperId))
		.limit(1);
	if (!paper) throw new Error("Paper not found");

	const markdown = await fetchOcrMarkdown(jsonlUrl);
	const markdownR2Key = `papers/${paper.hash}.md`;
	await opts.r2.put(markdownR2Key, markdown);

	const result = await ingestMarkdown(markdown, {
		source: paper.r2Key,
		paperId,
		db: opts.db,
		vectorize: opts.vectorize,
		env: opts.env,
	});

	await opts.db
		.update(papers)
		.set({ status: "ready", markdownR2Key, chunks: result.chunks })
		.where(eq(papers.id, paperId));

	return { chunks: result.chunks };
}

// ── User Paper Operations ───────────────────────────────────────────────────

export async function listUserPapers(db: DbClient, userId: string) {
	return db
		.select({
			id: papers.id,
			title: userPapers.title,
			chunks: papers.chunks,
			status: papers.status,
			createdAt: userPapers.createdAt,
		})
		.from(userPapers)
		.innerJoin(papers, eq(papers.id, userPapers.paperId))
		.where(eq(userPapers.userId, userId));
}

export async function renameUserPaper(
	db: DbClient,
	userId: string,
	paperId: string,
	title: string,
) {
	await db
		.update(userPapers)
		.set({ title })
		.where(and(eq(userPapers.userId, userId), eq(userPapers.paperId, paperId)));
}

export async function unlinkUserPaper(
	db: DbClient,
	userId: string,
	paperId: string,
) {
	await db
		.delete(userPapers)
		.where(and(eq(userPapers.userId, userId), eq(userPapers.paperId, paperId)));
}

export async function isUserLinked(
	db: DbClient,
	userId: string,
	paperId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ paperId: userPapers.paperId })
		.from(userPapers)
		.where(and(eq(userPapers.userId, userId), eq(userPapers.paperId, paperId)))
		.limit(1);
	return !!row;
}

export async function getPaperMarkdown(
	paperId: string,
	opts: { db: DbClient; r2: R2Bucket; userId: string },
): Promise<string | null> {
	if (!(await isUserLinked(opts.db, opts.userId, paperId))) return null;

	const [paper] = await opts.db
		.select()
		.from(papers)
		.where(eq(papers.id, paperId))
		.limit(1);
	if (!paper?.markdownR2Key) return null;

	const obj = await opts.r2.get(paper.markdownR2Key);
	if (!obj) return null;
	return obj.text();
}

// ── Retrieve Context (filtered by paperIds only) ────────────────────────────

export async function retrieveContext(
	query: string,
	opts: {
		paperIds: string[];
		topK?: number;
		db: DbClient;
		vectorize: VectorizeIndex;
		env: EmbeddingEnv;
	},
): Promise<string> {
	if (opts.paperIds.length === 0) return "";

	const embeddings = createEmbeddings(opts.env);
	const store = createVectorStore(opts.vectorize, embeddings);

	const filter: Record<string, unknown> =
		opts.paperIds.length === 1
			? { paperId: opts.paperIds[0] }
			: { paperId: { $in: opts.paperIds } };

	let results: [Document, number][];
	try {
		results = await store.similaritySearchWithScore(
			query,
			opts.topK ?? 5,
			filter,
		);
	} catch {
		return "";
	}

	const matchedIds = results
		.filter(([, score]) => score > 0.4)
		.map(([doc]) => doc.metadata.id as string);

	if (matchedIds.length === 0) return "";

	const rows = await opts.db
		.select({ id: documents.id, content: documents.content })
		.from(documents)
		.where(inArray(documents.id, matchedIds));

	const contentMap = new Map(rows.map((r) => [r.id, r.content]));
	return matchedIds
		.map((id) => contentMap.get(id))
		.filter(Boolean)
		.join("\n\n---\n\n");
}

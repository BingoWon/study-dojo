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
		try {
			const { result } = JSON.parse(line) as {
				result: {
					layoutParsingResults: Array<{ markdown: { text: string } }>;
				};
			};
			for (const page of result.layoutParsingResults) {
				parts.push(page.markdown.text);
			}
		} catch {
			console.warn("[RAG] Skipping malformed JSONL line");
		}
	}

	return parts.join("\n\n");
}

// ── Upload PDF: dedup by hash, link to user ─────────────────────────────────

/** Check if a paper with this hash already exists. */
export async function checkPaperByHash(
	db: DbClient,
	hash: string,
): Promise<
	{ exists: true; paperId: string; status: string } | { exists: false }
> {
	const [row] = await db
		.select({ id: papers.id, status: papers.status })
		.from(papers)
		.where(eq(papers.hash, hash))
		.limit(1);
	return row
		? { exists: true, paperId: row.id, status: row.status }
		: { exists: false };
}

/** Upload a new PDF: store in R2, submit OCR, link to user. */
export async function uploadNewPdf(
	pdfBuffer: ArrayBuffer,
	opts: {
		userId: string;
		db: DbClient;
		r2: R2Bucket;
		ocrToken: string;
	},
): Promise<{ paperId: string }> {
	const hash = await hashBuffer(pdfBuffer);
	const now = Math.floor(Date.now() / 1000);

	// Double-check dedup (race condition safety)
	const [existing] = await opts.db
		.select({ id: papers.id })
		.from(papers)
		.where(eq(papers.hash, hash))
		.limit(1);

	if (existing) {
		await opts.db
			.insert(userPapers)
			.values({ userId: opts.userId, paperId: existing.id, createdAt: now })
			.onConflictDoNothing();
		return { paperId: existing.id };
	}

	const paperId = crypto.randomUUID();
	const r2Key = `papers/${hash}.pdf`;

	await opts.r2.put(r2Key, pdfBuffer);
	const jobId = await submitOcrJob(pdfBuffer, opts.ocrToken);

	await opts.db.insert(papers).values({
		id: paperId,
		hash,
		r2Key,
		chunks: 0,
		status: "ocr_pending",
		jobId,
		createdAt: now,
	});

	await opts.db
		.insert(userPapers)
		.values({ userId: opts.userId, paperId, createdAt: now })
		.onConflictDoNothing();

	return { paperId };
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
	const setStatus = (status: string) =>
		opts.db.update(papers).set({ status }).where(eq(papers.id, paperId));

	const [paper] = await opts.db
		.select()
		.from(papers)
		.where(eq(papers.id, paperId))
		.limit(1);
	if (!paper) throw new Error("Paper not found");

	// Step 1: Fetch OCR markdown
	const markdown = await fetchOcrMarkdown(jsonlUrl);
	const markdownR2Key = `papers/${paper.hash}.md`;
	await opts.r2.put(markdownR2Key, markdown);
	await opts.db
		.update(papers)
		.set({ markdownR2Key })
		.where(eq(papers.id, paperId));

	// Step 2: Chunking
	await setStatus("chunking");
	const splitter = new MarkdownTextSplitter({
		chunkSize: CHUNK_SIZE,
		chunkOverlap: CHUNK_OVERLAP,
	});
	const chunks = await splitter.splitText(markdown);

	if (chunks.length === 0) {
		await opts.db
			.update(papers)
			.set({ status: "ready", chunks: 0 })
			.where(eq(papers.id, paperId));
		return { chunks: 0 };
	}

	const ids = chunks.map(() => crypto.randomUUID());
	const now = Math.floor(Date.now() / 1000);
	const rows = chunks.map((content, i) => ({
		id: ids[i],
		content,
		paperId,
		createdAt: now,
	}));

	for (let i = 0; i < rows.length; i += INSERT_BATCH) {
		await opts.db.insert(documents).values(rows.slice(i, i + INSERT_BATCH));
	}

	// Step 3: Embedding
	await setStatus("embedding");
	const embeddings = createEmbeddings(opts.env);
	const store = createVectorStore(opts.vectorize, embeddings);

	const docs = chunks.map(
		(content, i) =>
			new Document({
				pageContent: content,
				metadata: { id: ids[i], paperId },
			}),
	);

	try {
		await store.addDocuments(docs, { ids });
	} catch (e) {
		console.warn("[RAG] Vectorize skipped:", (e as Error).message);
	}

	// Done
	await opts.db
		.update(papers)
		.set({ status: "ready", chunks: chunks.length })
		.where(eq(papers.id, paperId));

	return { chunks: chunks.length };
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

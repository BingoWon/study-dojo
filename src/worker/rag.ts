import { CloudflareVectorizeStore } from "@langchain/cloudflare";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { and, desc, eq, inArray } from "drizzle-orm";
import mammoth from "mammoth";
import type { DbClient } from "./db";
import { documents, papers, userPapers } from "./schema";
import { isChinese, translateMarkdown } from "./translate";

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;
const INSERT_BATCH = 15;
const DEFAULT_DIMENSIONS = 1536;

const PADDLE_SYNC_URL =
	"https://y9z388hbpaj013l5.aistudio-app.com/layout-parsing";

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

// ── PaddleOCR Sync API ──────────────────────────────────────────────────────

async function parseWithPaddleOCR(
	fileBuffer: ArrayBuffer,
	token: string,
	fileType: 0 | 1,
): Promise<string> {
	const bytes = new Uint8Array(fileBuffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	const fileB64 = btoa(binary);

	const OCR_ERRORS: Record<number, string> = {
		403: "OCR 认证失败，请检查 Token",
		413: "文件过大，请减少页数或压缩文件",
		422: "参数无效",
		429: "今日解析额度已用完，请明天再试",
		500: "OCR 服务内部错误，请稍后重试",
		503: "OCR 服务繁忙，请稍后重试",
		504: "OCR 服务超时，请稍后重试",
	};

	let res: Response;
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 120_000);
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
		const msg =
			e instanceof Error && e.name === "AbortError"
				? "OCR 解析超时（120s），请尝试更小的文件"
				: `OCR 网络错误: ${(e as Error).message}`;
		throw new Error(msg);
	}

	if (!res.ok) {
		const hint = OCR_ERRORS[res.status];
		const detail = await res.text().catch(() => "");
		throw new Error(hint ?? `OCR 失败 (${res.status}): ${detail}`);
	}

	const data = (await res.json()) as {
		result: {
			layoutParsingResults: Array<{ markdown: { text: string } }>;
		};
	};

	return data.result.layoutParsingResults
		.map((p) => p.markdown.text)
		.join("\n\n");
}

// ── DOCX → Markdown ─────────────────────────────────────────────────────────

async function parseDocx(buffer: ArrayBuffer): Promise<string> {
	const result = await mammoth.extractRawText({ arrayBuffer: buffer });
	return result.value;
}

// ── File → Markdown dispatcher ──────────────────────────────────────────────

export type FileCategory = "ocr" | "text" | "docx";

export function classifyFile(name: string): {
	category: FileCategory;
	ocrType?: 0 | 1;
} {
	const ext = name.toLowerCase().split(".").pop() ?? "";
	if (ext === "pdf") return { category: "ocr", ocrType: 0 };
	if (["png", "jpg", "jpeg", "webp", "bmp", "tiff"].includes(ext))
		return { category: "ocr", ocrType: 1 };
	if (["txt", "md", "markdown"].includes(ext)) return { category: "text" };
	if (["docx"].includes(ext)) return { category: "docx" };
	return { category: "text" };
}

async function extractMarkdown(
	buffer: ArrayBuffer,
	category: FileCategory,
	ocrType: 0 | 1 | undefined,
	ocrToken: string,
): Promise<string> {
	switch (category) {
		case "text":
			return new TextDecoder().decode(buffer);
		case "docx":
			return parseDocx(buffer);
		case "ocr":
			return parseWithPaddleOCR(buffer, ocrToken, ocrType ?? 0);
	}
}

// ── Hash Check ──────────────────────────────────────────────────────────────

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

// ── Full Paper Ingestion (sync, with status callbacks) ──────────────────────

type StatusCallback = (status: string, data?: Record<string, unknown>) => void;

type IngestEnv = EmbeddingEnv & {
	PADDLE_OCR_TOKEN: string;
	TMT_SECRET_ID?: string;
	TMT_SECRET_KEY?: string;
};

export async function ingestFile(
	fileBuffer: ArrayBuffer,
	opts: {
		fileName?: string;
		fileExt?: string;
		category: FileCategory;
		ocrType?: 0 | 1;
		userId: string;
		db: DbClient;
		r2: R2Bucket;
		vectorize: VectorizeIndex;
		env: IngestEnv;
		onStatus: StatusCallback;
	},
): Promise<{ paperId: string; chunks: number }> {
	const { db, onStatus } = opts;
	const hash = await hashBuffer(fileBuffer);
	const ext =
		opts.category === "docx" ? "docx" : opts.ocrType === 1 ? "img" : "pdf";
	const now = Math.floor(Date.now() / 1000);

	// Dedup check
	const [existing] = await db
		.select({ id: papers.id, status: papers.status, lang: papers.lang })
		.from(papers)
		.where(eq(papers.hash, hash))
		.limit(1);

	if (existing) {
		await db
			.insert(userPapers)
			.values({ userId: opts.userId, paperId: existing.id, createdAt: now })
			.onConflictDoNothing();
		onStatus("ready", {
			paperId: existing.id,
			duplicate: true,
			status: existing.status,
			lang: existing.lang,
		});
		return { paperId: existing.id, chunks: 0 };
	}

	const paperId = crypto.randomUUID();
	const r2Key = `papers/${hash}.${ext}`;
	const setStatus = (status: string) =>
		db.update(papers).set({ status }).where(eq(papers.id, paperId));

	// Step 1: Upload
	onStatus("uploading", { paperId });
	await opts.r2.put(r2Key, fileBuffer);
	await db.insert(papers).values({
		id: paperId,
		hash,
		r2Key,
		fileExt: opts.fileExt ?? ext,
		chunks: 0,
		status: "uploading",
		createdAt: now,
	});
	await db
		.insert(userPapers)
		.values({ userId: opts.userId, paperId, createdAt: now })
		.onConflictDoNothing();

	// Step 2: Parse (PaddleOCR sync)
	onStatus("parsing", { paperId });
	await setStatus("parsing");
	const markdown = await extractMarkdown(
		fileBuffer,
		opts.category,
		opts.ocrType,
		opts.env.PADDLE_OCR_TOKEN,
	);
	const markdownR2Key = `papers/${hash}.md`;
	await opts.r2.put(markdownR2Key, markdown);
	await db.update(papers).set({ markdownR2Key }).where(eq(papers.id, paperId));

	// Detect language
	const lang = isChinese(markdown) ? "zh" : "en";
	await db.update(papers).set({ lang }).where(eq(papers.id, paperId));

	// Step 3: Translate
	onStatus("translating", { paperId, lang });
	await setStatus("translating");
	if (lang === "en" && opts.env.TMT_SECRET_ID && opts.env.TMT_SECRET_KEY) {
		try {
			const translated = await translateMarkdown(markdown, {
				TMT_SECRET_ID: opts.env.TMT_SECRET_ID,
				TMT_SECRET_KEY: opts.env.TMT_SECRET_KEY,
			});
			const translatedR2Key = `papers/${hash}.zh.md`;
			await opts.r2.put(translatedR2Key, translated);
			await db
				.update(papers)
				.set({ translatedR2Key })
				.where(eq(papers.id, paperId));
		} catch (e) {
			console.warn("[Translate] Failed, skipping:", (e as Error).message);
			onStatus("translating", { paperId, lang, skipped: true });
		}
	}

	// Step 4: Chunking (always on original language markdown)
	onStatus("chunking", { paperId, lang });
	await setStatus("chunking");
	const splitter = new MarkdownTextSplitter({
		chunkSize: CHUNK_SIZE,
		chunkOverlap: CHUNK_OVERLAP,
	});
	const chunks = await splitter.splitText(markdown);

	if (chunks.length === 0) {
		await db
			.update(papers)
			.set({ status: "ready", chunks: 0 })
			.where(eq(papers.id, paperId));
		onStatus("ready", { paperId, chunks: 0, lang, fileName: opts.fileName });
		return { paperId, chunks: 0 };
	}

	const ids = chunks.map(() => crypto.randomUUID());
	const rows = chunks.map((content, i) => ({
		id: ids[i],
		content,
		paperId,
		createdAt: now,
	}));

	for (let i = 0; i < rows.length; i += INSERT_BATCH) {
		await db.insert(documents).values(rows.slice(i, i + INSERT_BATCH));
	}

	// Step 5: Embedding
	onStatus("embedding", { paperId, lang });
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
	await db
		.update(papers)
		.set({ status: "ready", chunks: chunks.length })
		.where(eq(papers.id, paperId));
	onStatus("ready", {
		paperId,
		chunks: chunks.length,
		lang,
		fileName: opts.fileName,
	});

	return { paperId, chunks: chunks.length };
}

// ── User Paper Operations ───────────────────────────────────────────────────

export async function listUserPapers(db: DbClient, userId: string) {
	return db
		.select({
			id: papers.id,
			title: userPapers.title,
			chunks: papers.chunks,
			status: papers.status,
			lang: papers.lang,
			fileExt: papers.fileExt,
			createdAt: userPapers.createdAt,
		})
		.from(userPapers)
		.innerJoin(papers, eq(papers.id, userPapers.paperId))
		.where(eq(userPapers.userId, userId))
		.orderBy(desc(userPapers.createdAt));
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
	opts: {
		db: DbClient;
		r2: R2Bucket;
		userId: string;
		lang?: "original" | "zh";
	},
): Promise<string | null> {
	if (!(await isUserLinked(opts.db, opts.userId, paperId))) return null;

	const [paper] = await opts.db
		.select()
		.from(papers)
		.where(eq(papers.id, paperId))
		.limit(1);
	if (!paper?.markdownR2Key) return null;

	// If requesting Chinese translation and it exists, use it
	const r2Key =
		opts.lang === "zh" && paper.translatedR2Key
			? paper.translatedR2Key
			: paper.markdownR2Key;

	const obj = await opts.r2.get(r2Key);
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

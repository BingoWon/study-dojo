import { CloudflareVectorizeStore } from "@langchain/cloudflare";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import mammoth from "mammoth";
import type { DbClient } from "./db";
import { log } from "./log";
import { chunks as chunksTable, documents, userDocuments } from "./schema";
import { isChinese, translateMarkdown } from "./translate";

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 128;
const INSERT_BATCH = 15;
const DEFAULT_DIMENSIONS = 1536;

const PADDLE_OCR_URL_DEFAULT =
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
	ocrUrl?: string,
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
		res = await fetch(ocrUrl || PADDLE_OCR_URL_DEFAULT, {
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
				useChartRecognition: false,
				prettifyMarkdown: true,
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
	ocrUrl?: string,
): Promise<string> {
	switch (category) {
		case "text":
			return new TextDecoder().decode(buffer);
		case "docx":
			return parseDocx(buffer);
		case "ocr":
			return parseWithPaddleOCR(buffer, ocrToken, ocrType ?? 0, ocrUrl);
	}
}

// ── Hash Check ──────────────────────────────────────────────────────────────

export async function checkDocByHash(
	db: DbClient,
	hash: string,
): Promise<
	{ exists: true; docId: string; status: string } | { exists: false }
> {
	const [row] = await db
		.select({ id: documents.id, status: documents.status })
		.from(documents)
		.where(eq(documents.hash, hash))
		.limit(1);
	return row
		? { exists: true, docId: row.id, status: row.status }
		: { exists: false };
}

// ── Full Document Ingestion (sync, with status callbacks) ─────────────────

type StatusCallback = (status: string, data?: Record<string, unknown>) => void;

type IngestEnv = EmbeddingEnv & {
	PADDLE_OCR_TOKEN: string;
	PADDLE_OCR_URL?: string;
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
): Promise<{ docId: string; chunks: number }> {
	const { db, onStatus } = opts;
	const hash = await hashBuffer(fileBuffer);
	const ext =
		opts.category === "docx" ? "docx" : opts.ocrType === 1 ? "img" : "pdf";
	const now = Math.floor(Date.now() / 1000);

	// Dedup check
	const [existing] = await db
		.select({ id: documents.id, status: documents.status, lang: documents.lang })
		.from(documents)
		.where(eq(documents.hash, hash))
		.limit(1);

	if (existing) {
		await db
			.insert(userDocuments)
			.values({ userId: opts.userId, docId: existing.id, createdAt: now })
			.onConflictDoNothing();
		onStatus("ready", {
			docId: existing.id,
			duplicate: true,
			status: existing.status,
			lang: existing.lang,
		});
		return { docId: existing.id, chunks: 0 };
	}

	const docId = crypto.randomUUID();
	const r2Key = `docs/${hash}.${ext}`;
	const setStatus = (status: string) =>
		db.update(documents).set({ status }).where(eq(documents.id, docId));

	// Step 1: Upload
	onStatus("uploading", { docId });
	await opts.r2.put(r2Key, fileBuffer);
	await db.insert(documents).values({
		id: docId,
		hash,
		r2Key,
		fileExt: opts.fileExt ?? ext,
		chunks: 0,
		status: "uploading",
		createdAt: now,
	});
	await db
		.insert(userDocuments)
		.values({ userId: opts.userId, docId, createdAt: now })
		.onConflictDoNothing();

	// Step 2: Parse (PaddleOCR sync)
	onStatus("parsing", { docId });
	await setStatus("parsing");
	const markdown = await extractMarkdown(
		fileBuffer,
		opts.category,
		opts.ocrType,
		opts.env.PADDLE_OCR_TOKEN,
		opts.env.PADDLE_OCR_URL,
	);
	const markdownR2Key = `docs/${hash}.md`;
	await opts.r2.put(markdownR2Key, markdown);
	await db.update(documents).set({ markdownR2Key }).where(eq(documents.id, docId));

	// Detect language
	const lang = isChinese(markdown) ? "zh" : "en";
	await db.update(documents).set({ lang }).where(eq(documents.id, docId));

	// Step 3: Translate
	onStatus("translating", { docId, lang });
	await setStatus("translating");
	if (lang === "en" && opts.env.TMT_SECRET_ID && opts.env.TMT_SECRET_KEY) {
		try {
			const translated = await translateMarkdown(markdown, {
				TMT_SECRET_ID: opts.env.TMT_SECRET_ID,
				TMT_SECRET_KEY: opts.env.TMT_SECRET_KEY,
			});
			const translatedR2Key = `docs/${hash}.zh.md`;
			await opts.r2.put(translatedR2Key, translated);
			await db
				.update(documents)
				.set({ translatedR2Key })
				.where(eq(documents.id, docId));
		} catch (e) {
			log.warn({
				module: "rag",
				msg: "translation failed, skipping",
				error: (e as Error).message,
			});
			onStatus("translating", { docId, lang, skipped: true });
		}
	}

	// Step 4: Chunking (always on original language markdown)
	onStatus("chunking", { docId, lang });
	await setStatus("chunking");
	const splitter = new MarkdownTextSplitter({
		chunkSize: CHUNK_SIZE,
		chunkOverlap: CHUNK_OVERLAP,
	});
	const textChunks = await splitter.splitText(markdown);

	if (textChunks.length === 0) {
		await db
			.update(documents)
			.set({ status: "ready", chunks: 0 })
			.where(eq(documents.id, docId));
		onStatus("ready", { docId, chunks: 0, lang, fileName: opts.fileName });
		return { docId, chunks: 0 };
	}

	const ids = textChunks.map(() => crypto.randomUUID());
	const rows = textChunks.map((content, i) => ({
		id: ids[i],
		content,
		docId,
		createdAt: now,
	}));

	for (let i = 0; i < rows.length; i += INSERT_BATCH) {
		await db.insert(chunksTable).values(rows.slice(i, i + INSERT_BATCH));
	}

	// Step 5: Embedding
	onStatus("embedding", { docId, lang });
	await setStatus("embedding");
	const embeddings = createEmbeddings(opts.env);
	const store = createVectorStore(opts.vectorize, embeddings);

	const docs = textChunks.map(
		(content, i) =>
			new Document({
				pageContent: content,
				metadata: { id: ids[i], docId },
			}),
	);

	try {
		await store.addDocuments(docs, { ids });
	} catch (e) {
		log.warn({
			module: "rag",
			msg: "vectorize skipped",
			error: (e as Error).message,
		});
	}

	// Done
	await db
		.update(documents)
		.set({ status: "ready", chunks: textChunks.length })
		.where(eq(documents.id, docId));
	onStatus("ready", {
		docId,
		chunks: textChunks.length,
		lang,
		fileName: opts.fileName,
	});

	return { docId, chunks: textChunks.length };
}

// ── User Document Operations ──────────────────────────────────────────────

export async function listUserDocuments(db: DbClient, userId: string) {
	return db
		.select({
			id: documents.id,
			title: userDocuments.title,
			chunks: documents.chunks,
			status: documents.status,
			lang: documents.lang,
			fileExt: documents.fileExt,
			createdAt: userDocuments.createdAt,
		})
		.from(userDocuments)
		.innerJoin(documents, eq(documents.id, userDocuments.docId))
		.where(eq(userDocuments.userId, userId))
		.orderBy(desc(userDocuments.createdAt));
}

export async function renameUserDocument(
	db: DbClient,
	userId: string,
	docId: string,
	title: string,
) {
	await db
		.update(userDocuments)
		.set({ title })
		.where(and(eq(userDocuments.userId, userId), eq(userDocuments.docId, docId)));
}

export async function unlinkUserDocument(
	db: DbClient,
	userId: string,
	docId: string,
) {
	await db
		.delete(userDocuments)
		.where(and(eq(userDocuments.userId, userId), eq(userDocuments.docId, docId)));
}

export async function isUserLinked(
	db: DbClient,
	userId: string,
	docId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ docId: userDocuments.docId })
		.from(userDocuments)
		.where(and(eq(userDocuments.userId, userId), eq(userDocuments.docId, docId)))
		.limit(1);
	return !!row;
}

export async function getDocumentMarkdown(
	docId: string,
	opts: {
		db: DbClient;
		r2: R2Bucket;
		userId: string;
		lang?: "original" | "zh";
	},
): Promise<string | null> {
	if (!(await isUserLinked(opts.db, opts.userId, docId))) return null;

	const [doc] = await opts.db
		.select()
		.from(documents)
		.where(eq(documents.id, docId))
		.limit(1);
	if (!doc?.markdownR2Key) return null;

	const r2Key =
		opts.lang === "zh" && doc.translatedR2Key
			? doc.translatedR2Key
			: doc.markdownR2Key;

	const obj = await opts.r2.get(r2Key);
	if (!obj) return null;
	return obj.text();
}

export async function getDocumentMeta(
	db: DbClient,
	docId: string,
	userId: string,
) {
	if (!(await isUserLinked(db, userId, docId))) return null;
	const [row] = await db
		.select()
		.from(documents)
		.where(eq(documents.id, docId))
		.limit(1);
	return row ?? null;
}

export async function getDocumentChunks(db: DbClient, docId: string) {
	return db
		.select({ content: chunksTable.content })
		.from(chunksTable)
		.where(eq(chunksTable.docId, docId))
		.orderBy(sql`rowid`);
}

// ── Retrieve Context (filtered by docIds only) ─────────────────────────────

export async function retrieveContext(
	query: string,
	opts: {
		docIds: string[];
		topK?: number;
		db: DbClient;
		vectorize: VectorizeIndex;
		env: EmbeddingEnv;
	},
): Promise<string> {
	if (opts.docIds.length === 0) return "";

	const embeddings = createEmbeddings(opts.env);
	const store = createVectorStore(opts.vectorize, embeddings);

	const filter: Record<string, unknown> =
		opts.docIds.length === 1
			? { docId: opts.docIds[0] }
			: { docId: { $in: opts.docIds } };

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
		.select({ id: chunksTable.id, content: chunksTable.content })
		.from(chunksTable)
		.where(inArray(chunksTable.id, matchedIds));

	const contentMap = new Map(rows.map((r) => [r.id, r.content]));
	return matchedIds
		.map((id) => contentMap.get(id))
		.filter(Boolean)
		.join("\n\n---\n\n");
}

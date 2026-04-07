import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db";
import { log } from "../log";
import {
	checkDocByHash,
	classifyFile,
	getDocumentChunks,
	getDocumentMarkdown,
	getDocumentMeta,
	ingestFile,
	listUserDocuments,
	renameUserDocument,
	unlinkUserDocument,
} from "../rag";
import { documents, userDocuments } from "../schema";
import { generateLLMTitle, requireUserId } from "./helpers";

const docs = new Hono<{ Bindings: Env }>();

docs.get("/", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	return c.json(await listUserDocuments(db, userId));
});

docs.get("/check", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const hash = c.req.query("hash");
	if (!hash) return c.json({ error: "缺少 hash 参数" }, 400);

	const db = createDb(c.env.DB);
	const result = await checkDocByHash(db, hash);
	if (!result.exists) return c.json({ exists: false });

	const now = Math.floor(Date.now() / 1000);
	await db
		.insert(userDocuments)
		.values({ userId, docId: result.docId, createdAt: now })
		.onConflictDoNothing();

	return c.json(result);
});

docs.post("/", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const formData = await c.req.formData();
	const file = formData.get("file") as File | null;
	if (!file) return c.json({ error: "缺少文件" }, 400);

	const classified = classifyFile(file.name);
	if (classified.category === "ocr" && !c.env.PADDLE_OCR_TOKEN)
		return c.json({ error: "缺少 PADDLE_OCR_TOKEN 配置" }, 500);
	const db = createDb(c.env.DB);
	const buffer = await file.arrayBuffer();
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: string, data: Record<string, unknown>) => {
				controller.enqueue(
					encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
				);
			};

			let ingestDocId: string | undefined;
			try {
				const fileExt = file.name.split(".").pop()?.toLowerCase();
				await ingestFile(buffer, {
					fileName: file.name.replace(/\.[^.]+$/, ""),
					fileExt,
					category: classified.category,
					ocrType: classified.ocrType,
					userId,
					db,
					r2: c.env.R2,
					vectorize: c.env.VECTORIZE,
					env: c.env,
					onStatus: (status, data) => {
						if (data?.docId) ingestDocId = data.docId as string;
						send("status", { status, ...data });
					},
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : "处理失败";
				log.error({ module: "ingest", msg, docId: ingestDocId });
				if (ingestDocId) {
					await db
						.update(documents)
						.set({ status: "failed" })
						.where(eq(documents.id, ingestDocId))
						.catch(() => {});
				}
				send("status", { status: "failed", error: msg });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
});

docs.patch("/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const { title } = await c.req.json<{ title: string }>();
	const db = createDb(c.env.DB);
	await renameUserDocument(db, userId, c.req.param("id"), title);
	return c.json({ ok: true });
});

docs.delete("/:id", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	await unlinkUserDocument(db, userId, c.req.param("id"));
	return c.json({ ok: true });
});

docs.get("/:id/download", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const db = createDb(c.env.DB);
	const docId = c.req.param("id");

	const [row] = await db
		.select({ r2Key: documents.r2Key, title: userDocuments.title })
		.from(userDocuments)
		.innerJoin(documents, eq(documents.id, userDocuments.docId))
		.where(
			and(eq(userDocuments.userId, userId), eq(userDocuments.docId, docId)),
		)
		.limit(1);
	if (!row) return c.json({ error: "未找到" }, 404);

	const obj = await c.env.R2.get(row.r2Key);
	if (!obj) return c.json({ error: "文件不存在" }, 404);

	const isImage = !row.r2Key.endsWith(".pdf");
	const contentType = isImage ? "application/octet-stream" : "application/pdf";
	const ext = row.r2Key.split(".").pop() ?? "pdf";
	const filename = encodeURIComponent(row.title);
	return new Response(obj.body, {
		headers: {
			"Content-Type": contentType,
			"Content-Disposition": `attachment; filename="${filename}.${ext}"; filename*=UTF-8''${filename}.${ext}`,
		},
	});
});

docs.get("/:id/markdown", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const lang = (c.req.query("lang") as "original" | "zh") || "original";
	const db = createDb(c.env.DB);
	const md = await getDocumentMarkdown(c.req.param("id"), {
		db,
		r2: c.env.R2,
		userId,
		lang,
	});
	if (md === null) return c.json({ error: "未找到" }, 404);
	return c.text(md);
});

docs.get("/:id/chunks", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);
	const db = createDb(c.env.DB);
	const docId = c.req.param("id");
	const doc = await getDocumentMeta(db, docId, userId);
	if (!doc) return c.json({ error: "未找到" }, 404);
	const rows = await getDocumentChunks(db, docId);
	return c.json({ total: rows.length, chunks: rows.map((r) => r.content) });
});

docs.post("/:id/generate-title", async (c) => {
	const userId = await requireUserId(c);
	if (!userId) return c.json({ error: "未授权" }, 401);

	const db = createDb(c.env.DB);
	const docId = c.req.param("id");
	const { fileName, fileExt } = await c.req
		.json<{ fileName?: string; fileExt?: string }>()
		.catch(() => ({ fileName: undefined, fileExt: undefined }));

	const fullName = fileName
		? fileExt
			? `${fileName}.${fileExt}`
			: fileName
		: null;

	const md = await getDocumentMarkdown(docId, { db, r2: c.env.R2, userId });

	const excerpt = md?.slice(0, 500);
	if (!excerpt && !fullName) return c.json({ error: "未找到" }, 404);

	const hintStr = fullName ? `\n文件名：${fullName}` : "";
	const prompt = excerpt
		? `根据以下文档内容生成简洁中文标题，6-12个字，无标点无引号，只回复标题：${hintStr}\n${excerpt}`
		: `根据文件名生成简洁中文标题，6-12个字，无标点无引号，只回复标题：\n${fullName}`;
	const title = await generateLLMTitle(c.env, prompt);

	if (title) await renameUserDocument(db, userId, docId, title);
	return c.json({ title });
});

export default docs;

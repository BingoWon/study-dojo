import { webSearch } from "@exalabs/ai-sdk";
import { tool, zodSchema } from "ai";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbClient } from "./db";
import { addMemories } from "./memory";
import type { EmbeddingEnv } from "./rag";
import { retrieveContext } from "./rag";
import { chunks as chunksTable, documents } from "./schema";

/** Create memory tool with request-scoped context. */
export function createMemoryTool(opts: {
	env: { MEM0_API_KEY: string };
	userId: string;
}) {
	return {
		save_memory: tool({
			description:
				"保存用户信息到长期记忆。当用户要求你记住某些信息（偏好、个人信息、习惯等）时调用此工具。",
			inputSchema: zodSchema(
				z.object({
					content: z
						.string()
						.describe(
							"要记住的内容，用陈述句描述，如「用户的名字是王斌」「用户不吃辣」",
						),
				}),
			),
			execute: async ({ content }) => {
				await addMemories(opts.env, [{ role: "user", content }], opts.userId);
				// Mem0 processes memories asynchronously
				return { success: true, message: "已提交到记忆系统" };
			},
		}),
	};
}

/** HITL tool — blocks until user responds via interactive card. */
export const hitlTools = {
	ask_user: tool({
		description:
			"向用户提出问题或请求确认。当你需要用户做出选择、提供信息或确认操作时，**必须**调用此工具而非直接提问。工具会在聊天中渲染交互卡片，用户可以从预设选项中选择或自行输入。你**必须**提供至少 2 个选项供用户选择，数量不限。每个选项的 label 建议以 emoji 开头使界面更生动。",
		inputSchema: zodSchema(
			z.object({
				question: z.string().describe("向用户提出的问题"),
				options: z
					.array(
						z.object({
							label: z.string().describe("选项显示文本"),
							value: z.string().describe("选项值，返回给模型"),
							description: z.string().optional().describe("选项的补充说明"),
						}),
					)
					.min(2)
					.describe(
						"预设选项列表，至少 2 个。label 以 emoji 开头（如「✅ 确认」「🔄 重试」）。覆盖用户最可能的选择。",
					),
				allowCustomInput: z
					.boolean()
					.optional()
					.default(true)
					.describe("是否允许用户在选项之外自定义输入，默认允许"),
				placeholder: z.string().optional().describe("自定义输入框的占位文本"),
			}),
		),
		// No execute — blocks until frontend calls addToolResult
	}),
};

/** Create Exa search tools with request-scoped API key. */
export function createExaTools(opts: { env: { EXA_API_KEY: string } }) {
	return {
		search_web: webSearch({
			apiKey: opts.env.EXA_API_KEY,
			type: "auto",
			numResults: 8,
			contents: {
				text: { maxCharacters: 3000 },
			},
		}),
		search_papers: webSearch({
			apiKey: opts.env.EXA_API_KEY,
			type: "auto",
			numResults: 10,
			category: "research paper",
			contents: {
				text: { maxCharacters: 5000 },
			},
		}),
	};
}

/** Create document tools with request-scoped context. */
export function createDocTools(opts: {
	docIds: string[];
	docList: {
		id: string;
		title: string;
		lang?: string | null;
		fileExt?: string | null;
	}[];
	db: DbClient;
	vectorize: VectorizeIndex;
	env: EmbeddingEnv;
}) {
	return {
		doc_suggest: tool({
			description:
				"文档检索建议。当用户明确要求搜索文档或检索已上传文档时，调用此工具生成 3 个候选查询供用户选择。此工具需要等待用户确认后才会返回结果。",
			inputSchema: zodSchema(
				z.object({
					queries: z
						.array(z.string())
						.length(3)
						.describe("3 个候选检索查询，从不同角度覆盖用户问题"),
					defaultTopK: z
						.number()
						.min(1)
						.max(20)
						.default(5)
						.describe("推荐的检索结果数量"),
				}),
			),
			// No execute — tool blocks until frontend calls addToolResult
		}),

		doc_rag_search: tool({
			description:
				"对用户个人文档库执行 RAG 语义检索（非互联网搜索）。文档按 ~2048 字/块、256 字重叠切分并向量化，返回最相关的 chunk。不传 docIds 则搜索全部文档。",
			inputSchema: zodSchema(
				z.object({
					query: z.string().describe("检索查询"),
					topK: z.number().min(1).max(20).default(5).describe("检索结果数量"),
					docIds: z
						.array(z.string())
						.optional()
						.describe("可选，指定搜索的文档 ID 列表。不传则搜索全部文档"),
				}),
			),
			execute: async ({ query, topK, docIds: targetIds }) => {
				// Validate and resolve target IDs
				const allIds = opts.docIds;
				if (allIds.length === 0) {
					return { context: "", message: "用户尚未上传任何文档" };
				}
				const searchIds = targetIds?.length
					? targetIds.filter((id) => allIds.includes(id))
					: allIds;
				if (searchIds.length === 0) {
					return { context: "", message: "指定的文档不存在" };
				}
				const context = await retrieveContext(query, {
					docIds: searchIds,
					topK,
					db: opts.db,
					vectorize: opts.vectorize,
					env: opts.env,
				});
				return {
					context: context || "未找到相关内容",
					searchedDocuments: searchIds.length,
					totalDocuments: allIds.length,
				};
			},
		}),

		open_document: tool({
			description:
				"打开指定文档。当用户要求查看、打开或阅读某份已上传的文档时，调用此工具在文档查看器中展示。",
			inputSchema: zodSchema(
				z.object({
					docId: z.string().describe("文档 ID，从文档列表中获取"),
				}),
			),
			execute: async ({ docId }) => {
				const doc = opts.docList.find((d) => d.id === docId);
				if (!doc) return { success: false, message: "未找到该文档" };
				return {
					success: true,
					docId: doc.id,
					title: doc.title,
					lang: doc.lang,
					fileExt: doc.fileExt,
				};
			},
		}),

		highlight_document: tool({
			description:
				"高亮文档中的指定文本。会自动打开并跳转到高亮位置。可用于标注重点、引用原文等场景。不传 text 则高亮全文，color 设为 transparent 可清除高亮。",
			inputSchema: zodSchema(
				z.object({
					docId: z.string().describe("文档 ID"),
					text: z
						.string()
						.optional()
						.describe("要高亮的原文文本片段（精确匹配）。不传则高亮全文"),
					color: z
						.enum(["yellow", "red", "green", "blue", "purple", "transparent"])
						.optional()
						.default("yellow")
						.describe("高亮颜色。transparent 用于清除高亮"),
				}),
			),
			execute: async ({ docId, text, color }) => {
				const doc = opts.docList.find((d) => d.id === docId);
				if (!doc) return { success: false, message: "未找到该文档" };
				return {
					success: true,
					docId: doc.id,
					title: doc.title,
					lang: doc.lang,
					fileExt: doc.fileExt,
					text: text ?? null,
					color: color ?? "yellow",
				};
			},
		}),

		read_document: tool({
			description:
				"阅读文档内容。文档以分块（chunk）形式存储，每块约 2048 字符。可以按页阅读（每页默认 10 块），也可以一次读取全部。首次调用时不传参数即可获取文档概览和前 10 块内容，根据 totalChunks 决定是否继续读取。",
			inputSchema: zodSchema(
				z.object({
					docId: z.string().describe("文档 ID"),
					page: z
						.number()
						.int()
						.min(1)
						.optional()
						.default(1)
						.describe("页码，从 1 开始，默认第 1 页"),
					pageSize: z
						.number()
						.int()
						.min(1)
						.max(50)
						.optional()
						.default(10)
						.describe("每页块数，默认 10，最大 50。传 50 可快速浏览较短文档"),
				}),
			),
			execute: async ({ docId, page, pageSize }) => {
				const doc = opts.docList.find((d) => d.id === docId);
				if (!doc) return { error: "未找到该文档" };

				// Get total chunk count from documents table
				const [docRow] = await opts.db
					.select({ totalChunks: documents.chunks })
					.from(documents)
					.where(eq(documents.id, docId))
					.limit(1);
				const totalChunks = docRow?.totalChunks ?? 0;
				if (totalChunks === 0)
					return { error: "该文档尚无内容", title: doc.title };

				const offset = (page - 1) * pageSize;
				const totalPages = Math.ceil(totalChunks / pageSize);

				if (offset >= totalChunks) {
					return {
						error: `页码超出范围，共 ${totalPages} 页`,
						title: doc.title,
						totalChunks,
						totalPages,
					};
				}

				// Query chunks ordered by rowid (insertion order = document order)
				const rows = await opts.db
					.select({ content: chunksTable.content })
					.from(chunksTable)
					.where(eq(chunksTable.docId, docId))
					.orderBy(sql`rowid`)
					.limit(pageSize)
					.offset(offset);

				const content = rows.map((r) => r.content).join("\n\n");

				return {
					title: doc.title,
					content,
					page,
					pageSize,
					totalChunks,
					totalPages,
					chunksReturned: rows.length,
					hasMore: offset + rows.length < totalChunks,
				};
			},
		}),
	};
}

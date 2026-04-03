import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { DbClient } from "./db";
import { retrieveContext } from "./rag";

type RagEnv = {
	EMBEDDING_BASE_URL: string;
	EMBEDDING_API_KEY: string;
	EMBEDDING_MODEL: string;
	EMBEDDING_DIMENSIONS?: string;
};

/** Static tools available without request context. */
export const staticTools = {
	get_current_time: tool({
		description:
			"获取当前日期和时间。当用户询问现在几点或今天日期时调用此工具。",
		inputSchema: zodSchema(
			z.object({
				timezone: z
					.string()
					.optional()
					.describe("IANA 时区标识符，如 'Asia/Shanghai'，默认为 UTC"),
			}),
		),
		execute: async ({ timezone = "Asia/Shanghai" }: { timezone?: string }) => {
			const now = new Date();
			return {
				utc: now.toISOString(),
				local: now.toLocaleString("zh-CN", { timeZone: timezone }),
				timezone,
			};
		},
	}),
	get_weather: tool({
		description: "获取指定城市的当前天气信息。当用户询问天气时调用此工具。",
		inputSchema: zodSchema(
			z.object({
				location: z.string().describe("城市名称，如「北京」「上海」"),
				unit: z.enum(["celsius", "fahrenheit"]).optional().default("celsius"),
			}),
		),
		execute: async ({ location, unit }) => {
			await new Promise((resolve) => setTimeout(resolve, 800));
			return {
				location,
				temperature:
					Math.floor(Math.random() * 15) + (unit === "celsius" ? 10 : 50),
				condition: ["多云", "晴天", "小雨", "雷阵雨"][
					Math.floor(Math.random() * 4)
				],
				humidity: Math.floor(Math.random() * 40) + 40,
				wind_speed: Math.floor(Math.random() * 20) + 5,
				unit,
			};
		},
	}),
	search_web: tool({
		description: "搜索网络信息。当用户需要查找资料或搜索信息时调用此工具。",
		inputSchema: zodSchema(
			z.object({
				query: z.string().describe("搜索关键词"),
			}),
		),
		execute: async ({ query }) => {
			await new Promise((resolve) => setTimeout(resolve, 1500));
			return {
				query,
				results: [
					{
						title: `关于「${query}」的搜索结果 1`,
						url: "https://example.com/1",
						snippet: "这是与您查询高度相关的网页摘要信息。",
					},
					{
						title: `关于「${query}」的搜索结果 2`,
						url: "https://example.com/2",
						snippet: "另一条提供更多上下文的有用信息。",
					},
					{
						title: `「${query}」相关话题`,
						url: "https://example.com/3",
						snippet: "该页面包含可能对您有帮助的背景信息。",
					},
				],
			};
		},
	}),
	update_recipe: tool({
		description:
			"更新食谱卡片。当你创建或修改食谱时必须调用此工具。将完整的食谱数据传入，前端会实时渲染。",
		inputSchema: zodSchema(
			z.object({
				title: z.string().optional().describe("食谱标题"),
				skill_level: z
					.enum(["初级", "中级", "高级"])
					.optional()
					.describe("烹饪难度"),
				cooking_time: z
					.enum(["5分钟", "15分钟", "30分钟", "45分钟", "60+分钟"])
					.optional()
					.describe("烹饪时间"),
				ingredients: z
					.array(
						z.object({
							icon: z.string().describe("食材的 emoji 图标，如 🥕"),
							name: z.string().describe("食材名称"),
							amount: z.string().describe("用量"),
						}),
					)
					.optional()
					.describe("完整的食材列表（包含已有和新增的）"),
				instructions: z
					.array(z.string())
					.optional()
					.describe("完整的步骤列表（包含已有和新增的）"),
				special_preferences: z
					.array(z.string())
					.optional()
					.describe("饮食偏好标签"),
			}),
		),
		execute: async (input) => input,
	}),
};

/** Create RAG tools with request-scoped context. */
export function createRagTools(opts: {
	paperIds: string[];
	db: DbClient;
	vectorize: VectorizeIndex;
	env: RagEnv;
}) {
	return {
		suggest_paper_search: tool({
			description:
				"当用户提问与论文相关的问题时，先调用此工具生成 3 个候选检索查询供用户选择。生成的查询应从不同角度覆盖用户的问题。",
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
			execute: async (input) => ({
				...input,
				papers: opts.paperIds.length,
				needsConfirmation: true,
			}),
		}),

		search_papers: tool({
			description:
				"在用户上传的论文中执行检索。仅在用户确认检索参数后调用，或用户明确要求直接搜索时调用。",
			inputSchema: zodSchema(
				z.object({
					query: z.string().describe("检索查询"),
					topK: z.number().min(1).max(20).default(5).describe("检索结果数量"),
				}),
			),
			execute: async ({ query, topK }) => {
				if (opts.paperIds.length === 0) {
					return { context: "", message: "用户尚未上传任何论文" };
				}
				const context = await retrieveContext(query, {
					paperIds: opts.paperIds,
					topK,
					db: opts.db,
					vectorize: opts.vectorize,
					env: opts.env,
				});
				return {
					context: context || "未找到相关内容",
					papers: opts.paperIds.length,
				};
			},
		}),
	};
}

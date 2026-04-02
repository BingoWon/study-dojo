import { tool, zodSchema } from "ai";
import { z } from "zod";

export const tools = {
	get_current_time: tool({
		description:
			"Returns the current date and time. Call this whenever the user asks about the current time or date.",
		inputSchema: zodSchema(
			z.object({
				timezone: z
					.string()
					.optional()
					.describe(
						"IANA timezone identifier, e.g. 'Asia/Shanghai'. Defaults to UTC.",
					),
			}),
		),
		execute: async ({ timezone = "UTC" }: { timezone?: string }) => {
			const now = new Date();
			return {
				utc: now.toISOString(),
				local: now.toLocaleString("en-US", { timeZone: timezone }),
				timezone,
			};
		},
	}),
	get_weather: tool({
		description: "Get the current weather for a location.",
		inputSchema: zodSchema(
			z.object({
				location: z.string().describe("The city name, e.g., 'San Francisco'"),
				unit: z.enum(["celsius", "fahrenheit"]).optional().default("celsius"),
			}),
		),
		execute: async ({ location, unit }) => {
			await new Promise((resolve) => setTimeout(resolve, 800));
			return {
				location,
				temperature:
					Math.floor(Math.random() * 15) + (unit === "celsius" ? 10 : 50),
				condition: ["Partly Cloudy", "Sunny", "Raining", "Thunderstorm"][
					Math.floor(Math.random() * 4)
				],
				humidity: Math.floor(Math.random() * 40) + 40,
				wind_speed: Math.floor(Math.random() * 20) + 5,
				unit,
			};
		},
	}),
	search_web: tool({
		description: "Search the web for information.",
		inputSchema: zodSchema(
			z.object({
				query: z.string().describe("The search query"),
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

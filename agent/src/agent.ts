/**
 * Roast-Prof LangGraph agent — recipe assistant with shared state + HITL RAG.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { NativeChatModel } from "./llm.js";
import { AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { Annotation, Command, END, MessagesAnnotation, START, StateGraph, interrupt } from "@langchain/langgraph";

// ── Env helpers (langgraph-cli loads .env automatically) ─────────────────────

const env = (key: string, fallback = "") => {
	const v = process.env[key];
	return v && v.length > 0 ? v : fallback;
};

// ── State ────────────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: flexible recipe shape
type Recipe = Record<string, any>;

export const AgentState = Annotation.Root({
	recipe: Annotation<Recipe | undefined>({
		reducer: (_x, y) => y ?? _x,
		default: () => undefined,
	}),
	// biome-ignore lint/suspicious/noExplicitAny: CopilotKit frontend tools
	tools: Annotation<any[]>({
		reducer: (_x, y) => y ?? _x,
		default: () => [],
	}),
	...MessagesAnnotation.spec,
});

type State = typeof AgentState.State;

// ── Tool definitions ─────────────────────────────────────────────────────────

const UPDATE_RECIPE_TOOL = {
	type: "function" as const,
	function: {
		name: "update_recipe",
		description: "更新食谱卡片。必须将完整食谱数据放在 recipe 参数中。ALWAYS provide the entire recipe.",
		parameters: {
			type: "object",
			properties: {
				recipe: {
					type: "object",
					description: "完整的食谱数据",
					properties: {
						title: { type: "string" },
						skill_level: { type: "string", enum: ["初级", "中级", "高级"] },
						cooking_time: { type: "string", enum: ["5分钟", "15分钟", "30分钟", "45分钟", "60+分钟"] },
						ingredients: {
							type: "array",
							items: {
								type: "object",
								properties: {
									icon: { type: "string", description: "食材 emoji" },
									name: { type: "string" },
									amount: { type: "string" },
								},
								required: ["icon", "name", "amount"],
							},
						},
						instructions: { type: "array", items: { type: "string" } },
						special_preferences: { type: "array", items: { type: "string" } },
					},
				},
			},
			required: ["recipe"],
		},
	},
};

const STATIC_TOOLS = [
	{ type: "function" as const, function: { name: "get_current_time", description: "获取当前日期和时间", parameters: { type: "object", properties: { timezone: { type: "string" } } } } },
	{ type: "function" as const, function: { name: "get_weather", description: "获取指定城市天气", parameters: { type: "object", properties: { location: { type: "string" }, unit: { type: "string", enum: ["celsius", "fahrenheit"] } }, required: ["location"] } } },
	{ type: "function" as const, function: { name: "search_web", description: "搜索网络信息", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
];

const RAG_TOOLS = [
	{ type: "function" as const, function: { name: "rag_suggest", description: "资料 RAG 检索建议。生成 3 个候选查询供用户选择，会暂停等待确认。", parameters: { type: "object", properties: { queries: { type: "array", items: { type: "string" } }, defaultTopK: { type: "number" } }, required: ["queries", "defaultTopK"] } } },
	{ type: "function" as const, function: { name: "rag_search", description: "资料 RAG 检索执行。", parameters: { type: "object", properties: { query: { type: "string" }, topK: { type: "number" } }, required: ["query"] } } },
];

// ── Tool handlers ────────────────────────────────────────────────────────────

function createSupabaseClient() {
	const url = env("SUPABASE_URL");
	const key = env("SUPABASE_SERVICE_ROLE_KEY");
	if (!url || !key) return null;
	return createClient(url, key);
}

// biome-ignore lint/suspicious/noExplicitAny: tool handler args
type Handler = (args: any) => Promise<string>;

const handlers: Record<string, Handler> = {
	get_current_time: async ({ timezone = "Asia/Shanghai" }) =>
		JSON.stringify({ utc: new Date().toISOString(), local: new Date().toLocaleString("zh-CN", { timeZone: timezone }), timezone }),

	get_weather: async ({ location, unit = "celsius" }) =>
		JSON.stringify({ location, temperature: Math.floor(Math.random() * 15) + (unit === "celsius" ? 10 : 50), condition: ["多云", "晴天", "小雨"][Math.floor(Math.random() * 3)], humidity: Math.floor(Math.random() * 40) + 40, unit }),

	search_web: async ({ query }) =>
		JSON.stringify({ query, results: [{ title: `关于「${query}」的结果`, url: "https://example.com", snippet: "相关摘要信息。" }] }),

	update_recipe: async (input) => JSON.stringify(input.recipe ?? input),

	rag_search: async ({ query, topK = 5 }) => {
		const supabase = createSupabaseClient();
		const embeddingUrl = env("EMBEDDING_BASE_URL", env("OPENAI_BASE_URL"));
		const embeddingKey = env("EMBEDDING_API_KEY", env("OPENAI_API_KEY"));
		const embeddingModel = env("EMBEDDING_MODEL", "text-embedding-3-small");

		if (!supabase || !embeddingUrl || !embeddingKey) {
			return JSON.stringify({ context: "", message: "RAG 服务未配置" });
		}

		try {
			// Embed query
			const controller = new AbortController();
			setTimeout(() => controller.abort(), 30_000);
			const embedRes = await fetch(`${embeddingUrl}/embeddings`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${embeddingKey}` },
				body: JSON.stringify({ input: [query], model: embeddingModel, dimensions: 1536 }),
				signal: controller.signal,
			});
			// biome-ignore lint/suspicious/noExplicitAny: embedding response
			const embedData = (await embedRes.json()) as any;
			const queryEmbedding = embedData.data?.[0]?.embedding;
			if (!queryEmbedding) return JSON.stringify({ context: "", message: "嵌入失败" });

			// Search via Supabase RPC (pass array directly, not stringified)
			const { data: results, error } = await supabase.rpc("match_documents", {
				query_embedding: queryEmbedding,
				match_count: topK,
				filter_paper_ids: [],
			});

			if (error || !results?.length) return JSON.stringify({ context: "未找到相关内容", papers: 0 });
			return JSON.stringify({ context: results.map((r: { content: string }) => r.content).join("\n\n---\n\n"), papers: results.length });
		} catch (e) {
			return JSON.stringify({ context: "", message: `检索错误: ${(e as Error).message}` });
		}
	},
};

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一个智能的 AI 食谱助手，帮助用户创建和改进食谱。

核心能力：
1. **食谱创建与修改**: 当用户请求创建或修改食谱时，**必须**调用 \`update_recipe\` 工具。
2. **RAG 资料库检索**: 当用户**明确要求 RAG 搜索**时，使用 \`rag_suggest\`。
3. **天气查询**: 调用 \`get_weather\`。
4. **网络搜索**: 调用 \`search_web\`。

RAG 规则：仅当用户明确要求时才调用 \`rag_suggest\`，用户确认后根据 action 调用 \`rag_search\`。

食谱规则：ingredients 中每个食材必须有 icon（emoji）、name、amount。修改时保留已有内容。完成后一句话说明即可。

通用规则：严格使用简体中文。保持简明扼要。`;

// ── Graph nodes ──────────────────────────────────────────────────────────────

async function startFlow(state: State, config?: RunnableConfig): Promise<Command> {
	if (!state.recipe) {
		state.recipe = {
			title: "创建你的食谱", skill_level: "中级", cooking_time: "30分钟",
			special_preferences: [], ingredients: [{ icon: "🍴", name: "示例食材", amount: "1 份" }],
			instructions: ["第一步..."],
		};
		await dispatchCustomEvent("manually_emit_intermediate_state", state, config);
	}
	return new Command({ goto: "chat", update: { messages: state.messages, recipe: state.recipe } });
}

async function chatNode(state: State, config?: RunnableConfig): Promise<Command> {
	const recipeJson = state.recipe ? JSON.stringify(state.recipe, null, 2) : "暂无食谱";
	const fullPrompt = `${SYSTEM_PROMPT}\n\n当前食谱状态：\n${recipeJson}`;

	const model = new NativeChatModel({
		baseURL: env("BASE_URL", env("OPENAI_BASE_URL")),
		apiKey: env("API_KEY", env("OPENAI_API_KEY")),
		model: env("MODEL"),
	});

	if (!config) config = { recursionLimit: 25 };
	if (!config.metadata) config.metadata = {};
	config.metadata.predict_state = [{ state_key: "recipe", tool: "update_recipe", tool_argument: "recipe" }];

	const allTools = [...(state.tools ?? []), UPDATE_RECIPE_TOOL, ...STATIC_TOOLS, ...RAG_TOOLS];
	const bound = model.bindTools(allTools, { parallel_tool_calls: false });
	const response = await bound.invoke([new SystemMessage({ content: fullPrompt }), ...state.messages], config);
	const messages = [...state.messages, response];

	if (response.tool_calls?.length) {
		const tc = response.tool_calls[0];

		if (tc.name === "update_recipe") {
			const recipeData = tc.args.recipe ?? tc.args;
			const recipe = state.recipe ? { ...state.recipe, ...recipeData } : recipeData;
			state.recipe = recipe;
			await dispatchCustomEvent("manually_emit_intermediate_state", state, config);
			return new Command({
				goto: "start",
				update: { messages: [...messages, { role: "tool" as const, content: "食谱已更新。", tool_call_id: tc.id }], recipe },
			});
		}

		return new Command({ goto: "execute_tools", update: { messages, recipe: state.recipe } });
	}

	return new Command({ goto: END, update: { messages, recipe: state.recipe } });
}

async function toolsNode(state: State): Promise<Command> {
	const lastMsg = state.messages[state.messages.length - 1];
	if (!(lastMsg instanceof AIMessage)) return new Command({ goto: END, update: {} });

	const tc = lastMsg.tool_calls?.[0];
	if (!tc) return new Command({ goto: END, update: {} });

	if (tc.name === "rag_suggest") {
		const userResponse = interrupt({
			type: "rag_suggest", toolCallId: tc.id,
			queries: tc.args.queries, defaultTopK: tc.args.defaultTopK,
		});
		return new Command({
			goto: "chat",
			update: { messages: [...state.messages, new ToolMessage({ tool_call_id: tc.id ?? "", content: JSON.stringify(userResponse) })] },
		});
	}

	const handler = handlers[tc.name];
	const result = handler ? await handler(tc.args) : JSON.stringify({ error: `Unknown tool: ${tc.name}` });
	return new Command({
		goto: "chat",
		update: { messages: [...state.messages, new ToolMessage({ tool_call_id: tc.id ?? "", content: result })] },
	});
}

// ── Build graph ──────────────────────────────────────────────────────────────

export const graph = new StateGraph(AgentState)
	.addNode("start", startFlow, { ends: ["chat"] })
	.addNode("chat", chatNode, { ends: ["start", "execute_tools", "__end__"] })
	.addNode("execute_tools", toolsNode, { ends: ["chat", "__end__"] })
	.addEdge(START, "start")
	.compile();

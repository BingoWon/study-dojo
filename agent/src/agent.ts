/**
 * Roast-Prof LangGraph agent — recipe assistant with shared state + HITL RAG.
 *
 * Features:
 * - recipe as shared state (bidirectional sync with CopilotKit frontend)
 * - predict_state for streaming recipe tool args in real-time
 * - interrupt() for RAG search confirmation (HITL)
 * - dispatchCustomEvent for explicit state pushes
 */

import { ChatOpenAI } from "@langchain/openai";
import {
	AIMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import {
	Annotation,
	Command,
	END,
	MessagesAnnotation,
	START,
	StateGraph,
	interrupt,
} from "@langchain/langgraph";

// ── State (recipe is shared with CopilotKit frontend) ───────────────────────

// biome-ignore lint/suspicious/noExplicitAny: flexible recipe shape
type Recipe = any;

export const AgentState = Annotation.Root({
	recipe: Annotation<Recipe | undefined>({
		reducer: (_x, y) => y ?? _x,
		default: () => undefined,
	}),
	// biome-ignore lint/suspicious/noExplicitAny: CopilotKit injects frontend tools
	tools: Annotation<any[]>({
		reducer: (_x, y) => y ?? _x,
		default: () => [],
	}),
	...MessagesAnnotation.spec,
});

type State = typeof AgentState.State;

// ── Tool definitions ─────────────────────────────────────────────���───────────

const UPDATE_RECIPE_TOOL = {
	type: "function" as const,
	function: {
		name: "update_recipe",
		description:
			"更新食谱卡片。当你创建或修改食谱时必须调用此工具。将完整食谱数据传入，前端会实时流式渲染。",
		parameters: {
			type: "object",
			properties: {
				title: { type: "string" },
				skill_level: { type: "string", enum: ["初级", "中级", "高级"] },
				cooking_time: {
					type: "string",
					enum: ["5分钟", "15分钟", "30分钟", "45分钟", "60+分钟"],
				},
				ingredients: {
					type: "array",
					items: {
						type: "object",
						properties: {
							icon: { type: "string", description: "食材 emoji，如 🥕" },
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
};

const STATIC_TOOLS = [
	{
		type: "function" as const,
		function: {
			name: "get_current_time",
			description: "获取当前日期和时间",
			parameters: {
				type: "object",
				properties: {
					timezone: { type: "string", description: "IANA 时区标识符" },
				},
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "get_weather",
			description: "获取指定城市的当前天气信息",
			parameters: {
				type: "object",
				properties: {
					location: { type: "string", description: "城市名称" },
					unit: { type: "string", enum: ["celsius", "fahrenheit"] },
				},
				required: ["location"],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "search_web",
			description: "搜索网络信息",
			parameters: {
				type: "object",
				properties: {
					query: { type: "string", description: "搜索关键词" },
				},
				required: ["query"],
			},
		},
	},
];

const RAG_TOOLS = [
	{
		type: "function" as const,
		function: {
			name: "rag_suggest",
			description:
				"资料 RAG 检索建议。当用户明确要求 RAG 搜索或资料库检索时，调用此工具生成 3 个候选查询供用户选择。此工具会暂停等待用户确认。",
			parameters: {
				type: "object",
				properties: {
					queries: {
						type: "array",
						items: { type: "string" },
						description: "3 个候选检索查询",
					},
					defaultTopK: { type: "number", description: "推荐检索数量" },
				},
				required: ["queries", "defaultTopK"],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "rag_search",
			description: "资料 RAG 检索执行。在用户确认检索参数后调用。",
			parameters: {
				type: "object",
				properties: {
					query: { type: "string" },
					topK: { type: "number" },
				},
				required: ["query"],
			},
		},
	},
];

// ── Tool handlers ──────────────────────────────────────────────────────���─────

// biome-ignore lint/suspicious/noExplicitAny: tool handler args
type Handler = (args: any) => Promise<string>;

const handlers: Record<string, Handler> = {
	get_current_time: async ({ timezone = "Asia/Shanghai" }) => {
		const now = new Date();
		return JSON.stringify({
			utc: now.toISOString(),
			local: now.toLocaleString("zh-CN", { timeZone: timezone }),
			timezone,
		});
	},
	get_weather: async ({ location, unit = "celsius" }) =>
		JSON.stringify({
			location,
			temperature:
				Math.floor(Math.random() * 15) + (unit === "celsius" ? 10 : 50),
			condition: ["多云", "晴天", "小雨", "雷阵雨"][
				Math.floor(Math.random() * 4)
			],
			humidity: Math.floor(Math.random() * 40) + 40,
			wind_speed: Math.floor(Math.random() * 20) + 5,
			unit,
		}),
	search_web: async ({ query }) =>
		JSON.stringify({
			query,
			results: [
				{ title: `关于「${query}」的搜索结果 1`, url: "https://example.com/1", snippet: "相关的网页摘要。" },
				{ title: `关于「${query}」的搜索结果 2`, url: "https://example.com/2", snippet: "另一条有用信息。" },
			],
		}),
	update_recipe: async (input) => JSON.stringify(input),
	rag_search: async ({ query, topK = 5 }) => {
		// TODO: Wire to Cloudflare Vectorize HTTP API + D1 for document retrieval
		return JSON.stringify({
			context: `检索结果：关于「${query}」的 ${topK} 条相关内容（待接入 Vectorize）`,
			papers: 0,
		});
	},
};

// ── System prompt ────────────────────────────────────────────���───────────────

const SYSTEM_PROMPT = `你是一个智能的 AI 食谱助手，帮助用户创建和改进食谱。

核心能力：
1. **食谱创建与修改**: 当用户请求创建或修改食谱时，**必须**调用 \`update_recipe\` 工具。每次修改都要传入完整的食谱数据。
2. **RAG 资料库检索**: 当用户**明确要求 RAG 搜索或资料库检索**时，使用 \`rag_suggest\` 工具。
3. **天气查询**: 调用 \`get_weather\`。
4. **网络搜索**: 调用 \`search_web\`。

RAG 检索规则（Human-in-the-Loop）：
- **仅当**用户明确要求 RAG 搜索时，才调用 \`rag_suggest\` 生成 3 个候选查询。
- 用户选择后，根据返回的 action 字段执行：
  - \`confirm\`：按返回的 query 和 topK 调用 \`rag_search\`。
  - \`auto\`：自行决定最佳查询来调用 \`rag_search\`。
  - \`skip\`：用合理的查询直接调用 \`rag_search\`。

食谱规则：
- \`ingredients\` 中每个食材必须有 \`icon\`（emoji）、\`name\` 和 \`amount\`。
- 修改食谱时保留已有内容，在其基础上追加或调整。
- 完成食谱创建/修改后用一句话说明，不要重复描述食谱内容。

通用规则：
- 严格使用**简体中文**交流。
- 保持回答简明扼要。`;

// ── Graph nodes ──────────────────────────��────────────────────────���──────────

async function startFlow(
	state: State,
	config?: RunnableConfig,
): Promise<Command> {
	// Initialize recipe if not present
	if (!state.recipe) {
		state.recipe = {
			title: "创建你的食谱",
			skill_level: "中级",
			cooking_time: "30分钟",
			special_preferences: [],
			ingredients: [
				{ icon: "🍴", name: "示例食材", amount: "1 份" },
			],
			instructions: ["第一步..."],
		};
		await dispatchCustomEvent(
			"manually_emit_intermediate_state",
			state,
			config,
		);
	}

	return new Command({
		goto: "chat",
		update: { messages: state.messages, recipe: state.recipe },
	});
}

async function chatNode(
	state: State,
	config?: RunnableConfig,
): Promise<Command> {
	const recipeJson = state.recipe
		? JSON.stringify(state.recipe, null, 2)
		: "暂无食谱";

	const fullPrompt = `${SYSTEM_PROMPT}\n\n当前食谱状态：\n${recipeJson}`;

	const model = new ChatOpenAI({ model: "gpt-4o-mini" });

	// predict_state: stream update_recipe tool args as state updates in real-time
	if (!config) config = { recursionLimit: 25 };
	if (!config.metadata) config.metadata = {};
	config.metadata.predict_state = [
		{
			state_key: "recipe",
			tool: "update_recipe",
			tool_argument: "recipe",
		},
	];

	const allTools = [
		...(state.tools ?? []),
		UPDATE_RECIPE_TOOL,
		...STATIC_TOOLS,
		...RAG_TOOLS,
	];

	const bound = model.bindTools(allTools, { parallel_tool_calls: false });

	const response = await bound.invoke(
		[new SystemMessage({ content: fullPrompt }), ...state.messages],
		config,
	);

	const messages = [...state.messages, response];

	// Handle tool calls
	if (response.tool_calls?.length) {
		const tc = response.tool_calls[0];

		if (tc.name === "update_recipe") {
			// Update recipe state
			const recipe = state.recipe
				? { ...state.recipe, ...tc.args }
				: tc.args;

			state.recipe = recipe;
			await dispatchCustomEvent(
				"manually_emit_intermediate_state",
				state,
				config,
			);

			return new Command({
				goto: "start",
				update: {
					messages: [
						...messages,
						{
							role: "tool" as const,
							content: "食谱已更新。",
							tool_call_id: tc.id,
						},
					],
					recipe,
				},
			});
		}

		// Regular tool or HITL
		return new Command({
			goto: "execute_tools",
			update: { messages, recipe: state.recipe },
		});
	}

	return new Command({
		goto: END,
		update: { messages, recipe: state.recipe },
	});
}

async function toolsNode(state: State): Promise<Command> {
	const lastMsg = state.messages[state.messages.length - 1];
	if (!(lastMsg instanceof AIMessage)) {
		return new Command({ goto: END, update: {} });
	}

	const tc = lastMsg.tool_calls?.[0];
	if (!tc) return new Command({ goto: END, update: {} });

	// HITL: interrupt for rag_suggest
	if (tc.name === "rag_suggest") {
		const userResponse = interrupt({
			type: "rag_suggest",
			toolCallId: tc.id,
			queries: tc.args.queries,
			defaultTopK: tc.args.defaultTopK,
		});
		return new Command({
			goto: "chat",
			update: {
				messages: [
					...state.messages,
					new ToolMessage({
						tool_call_id: tc.id ?? "",
						content: JSON.stringify(userResponse),
					}),
				],
			},
		});
	}

	// Regular tool execution
	const handler = handlers[tc.name];
	const result = handler
		? await handler(tc.args)
		: JSON.stringify({ error: `Unknown tool: ${tc.name}` });

	return new Command({
		goto: "chat",
		update: {
			messages: [
				...state.messages,
				new ToolMessage({ tool_call_id: tc.id ?? "", content: result }),
			],
		},
	});
}

// ── Build graph ─────────────��────────────────────────────────────────────────

export const graph = new StateGraph(AgentState)
	.addNode("start", startFlow, { ends: ["chat"] })
	.addNode("chat", chatNode, { ends: ["start", "execute_tools", "__end__"] })
	.addNode("execute_tools", toolsNode, { ends: ["chat", "__end__"] })
	.addEdge(START, "start")
	.compile();

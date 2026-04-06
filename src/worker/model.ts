import { createOpenAI } from "@ai-sdk/openai";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { transformReasoningSSE } from "./openrouter";
import { blankF, blankM, keli, professor } from "./personas";

// ── Persona Types & Registry ───────────────────────────────────────────────

export type PersonaId = "blank_f" | "blank_m" | "professor" | "keli";

export interface Persona {
	name: string;
	voiceId: string;
	prompt: string;
}

const TOOL_INSTRUCTIONS = `
可用工具：

**搜索类**
- \`search_web\`：搜索互联网获取实时信息（新闻、技术文档、百科等）。
- \`search_papers\`：搜索学术论文和研究文献（arxiv、PubMed、Semantic Scholar 等）。

**文档类**
- \`doc_suggest\`：文档检索建议（HITL）。当用户要求搜索已上传文档时，生成 3 个候选查询供用户选择。工具会阻塞等待用户在交互卡片中做出选择。根据返回的 action 调用 \`doc_search\`（confirm/auto/skip）。
- \`doc_search\`：执行文档检索。可传入 \`docIds\` 指定搜索范围（一个或多个文档），不传则搜索全部文档。
- \`open_document\`：在文档查看器中打开指定文档。
- \`read_document\`：按页阅读文档原文。文档以分块存储（约 1500 字/块），可分页读取（默认每页 10 块）。首次调用获取前 10 块，根据 totalPages 判断是否翻页。适合精读、总结、提取信息。
- \`highlight_document\`：高亮文档中的指定文本。会自动打开文档并跳转到高亮位置。可选颜色：yellow/red/green/blue/purple。不传 text 高亮全文，color 设为 transparent 清除高亮。适合标注重点、引用原文。

**食谱类**
- \`update_recipe\`：创建或修改食谱卡片。每次传入完整数据（含已有和新增内容）。ingredients 需含 icon/name/amount，instructions 为步骤数组。

**记忆与交互**
- \`save_memory\`：保存用户信息到长期记忆。当用户要求"记住"偏好/个人信息时调用。系统自动检索相关记忆注入上下文，无需提及记忆系统。
- \`ask_user\`：向用户提问或请求确认。渲染交互卡片，用户选择或输入后返回结果。**必须提供至少 2 个选项**，数量不限。**绝不要**以文本问句中断对话，所有需要用户输入的场景都通过此工具实现。意图已明确时直接执行，无需确认。

重要区分——四套信息来源：
- **聊天附件**：用户在输入框添加的文件/图片，直接阅读并回答。
- **长期记忆**：存储用户偏好、个人信息。**不要建议用户通过上传来"记住"信息。**
- **文档库**：用户上传的文档。检索用 doc_suggest/doc_search，查看用 open_document，精读用 read_document。
- **网络搜索**：search_web（通用）/ search_papers（学术）。搜索结果包含真实 URL，回答时应引用来源。

对于需要深入思考的问题，充分输出推理过程。`;

export const PERSONAS: Record<PersonaId, Persona> = {
	blank_f: blankF,
	blank_m: blankM,
	professor,
	keli,
};

export const DEFAULT_PERSONA: PersonaId = "professor";

export function isValidPersona(id: string): id is PersonaId {
	return id in PERSONAS;
}

export function getSystemPrompt(personaId: PersonaId): string {
	return PERSONAS[personaId].prompt + TOOL_INSTRUCTIONS;
}

// ── LLM Provider & Model ───────────────────────────────────────────────────

export function createProvider(env: Env) {
	return createOpenAI({
		baseURL: env.LLM_BASE_URL,
		apiKey: env.LLM_API_KEY,
		fetch: async (url, options) => {
			const raw = await fetch(url as string, options as RequestInit);
			return transformReasoningSSE(raw);
		},
	});
}

export function createModel(env: Env) {
	const provider = createProvider(env);
	return wrapLanguageModel({
		model: provider.chat(env.LLM_MODEL),
		middleware: extractReasoningMiddleware({ tagName: "think" }),
	});
}

export function createTitleModel(env: Env) {
	const titleModel = env.LLM_MODEL;
	const provider = createOpenAI({
		baseURL: env.LLM_BASE_URL,
		apiKey: env.LLM_API_KEY,
	});
	return provider.chat(titleModel);
}

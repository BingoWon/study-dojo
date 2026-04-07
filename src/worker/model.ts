import { createOpenAI } from "@ai-sdk/openai";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { transformReasoningSSE } from "./openrouter";
import { keli, raiden, shiyu, yixuan } from "./personas";

// ── Persona Types & Registry ───────────────────────────────────────────────

export type PersonaId = "raiden" | "keli" | "shiyu" | "yixuan";

/** Common poses shared across all personas. */
export const BASE_POSES = [
	"neutral",
	"happy",
	"sad",
	"angry",
	"surprised",
	"thoughtful",
] as const;

export interface Persona {
	// Display
	name: string;
	emoji: string;
	title: string;
	desc: string;
	accentColor: string;
	gradient: string;
	border: string;
	glow: string;
	placeholder: string;
	// Voice
	voiceId: string;
	voiceSpeed?: number;
	voiceStability?: number;
	firstMessages: { text: string; pose: string }[];
	// LLM
	prompt: string;
	// Dialogue mode: per-persona pose set (filenames without extension)
	// Merged with BASE_POSES at runtime. Images at /characters/{id}/poses/{pose}.webp
	poses?: string[];
}

/** Get the full pose list for a persona (base + persona-specific). */
export function getPoses(personaId: PersonaId): string[] {
	const persona = PERSONAS[personaId];
	const extra = persona.poses ?? [];
	return [...new Set([...BASE_POSES, ...extra])];
}

const TOOL_INSTRUCTIONS = `
可用工具：

**搜索类**
- \`search_web\`：搜索互联网获取实时信息（新闻、技术文档、百科等）。
- \`search_papers\`：搜索学术论文和研究文献（arxiv、PubMed、Semantic Scholar 等）。

**文档类**（用户上传的个人文档库，非互联网资源）
- \`doc_suggest\`：文档检索建议（HITL）。当用户要求搜索已上传文档时，生成 3 个候选查询供用户选择。工具会阻塞等待用户在交互卡片中做出选择。根据返回的 action 调用 \`doc_rag_search\`（confirm/auto/skip）。
- \`doc_rag_search\`：对用户文档库执行 RAG 语义检索。文档按 ~1500 字/块切分（128 字重叠），通过向量相似度匹配返回最相关的 chunk。topK 默认 5，可按需调整（简单问题 3 条够用，复杂主题可提高到 10-15）。可传 \`docIds\` 限定搜索范围。
- \`open_document\`：在文档查看器中打开指定文档。
- \`read_document\`：按页阅读文档原文。文档以分块存储（约 1500 字/块），可分页读取（默认每页 10 块）。首次调用获取前 10 块，根据 totalPages 判断是否翻页。适合精读、总结、提取信息。
- \`highlight_document\`：高亮文档中的指定文本。会自动打开文档并跳转到高亮位置。可选颜色：yellow/red/green/blue/purple。不传 text 高亮全文，color 设为 transparent 清除高亮。适合标注重点、引用原文。

**记忆与交互**
- \`save_memory\`：保存用户信息到长期记忆。当用户要求"记住"偏好/个人信息时调用。系统自动检索相关记忆注入上下文，无需提及记忆系统。
- \`ask_user\`：向用户提问或请求确认。渲染交互卡片，用户选择或输入后返回结果。**必须提供至少 2 个选项**，数量不限。**绝不要**以文本问句中断对话，所有需要用户输入的场景都通过此工具实现。意图已明确时直接执行，无需确认。**同一轮对话中不要连续调用 ask_user 超过 2 次**——如果用户已经做出了选择，立即基于选择结果行动或回复，不要追问过多。

重要区分——四套信息来源：
- **聊天附件**：用户在输入框添加的文件/图片，直接阅读并回答。
- **长期记忆**：存储用户偏好、个人信息。**不要建议用户通过上传来"记住"信息。**
- **文档库**：用户上传的个人文档。检索用 doc_suggest/doc_rag_search，查看用 open_document，精读用 read_document。区别于网络搜索——文档库是用户自己上传的资料。
- **网络搜索**：search_web（通用）/ search_papers（学术论文）。搜索结果包含真实 URL，回答时应引用来源。

对于需要深入思考的问题，充分输出推理过程。`;

export const PERSONAS: Record<PersonaId, Persona> = {
	raiden,
	keli,
	shiyu,
	yixuan,
};

export const DEFAULT_PERSONA: PersonaId = "raiden";

/** Map legacy persona IDs from older threads to current IDs. */
const LEGACY_PERSONA_MAP: Record<string, PersonaId> = {
	professor: "raiden",
	blank_f: "shiyu",
	blank_m: "yixuan",
};

export function isValidPersona(id: string): id is PersonaId {
	return id in PERSONAS;
}

/** Resolve a persona ID, mapping legacy values to current ones. */
export function resolvePersona(id: string): PersonaId {
	if (isValidPersona(id)) return id;
	return LEGACY_PERSONA_MAP[id] ?? DEFAULT_PERSONA;
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

/** Dialogue mode: separate provider + model, no reasoning middleware. */
export function createDialogueModel(env: Env) {
	const provider = createOpenAI({
		baseURL: env.DIALOGUE_BASE_URL || env.LLM_BASE_URL,
		apiKey: env.DIALOGUE_API_KEY || env.LLM_API_KEY,
	});
	return provider.chat(env.DIALOGUE_MODEL || env.LLM_MODEL);
}

export function createTitleModel(env: Env) {
	const provider = createOpenAI({
		baseURL: env.LLM_BASE_URL,
		apiKey: env.LLM_API_KEY,
	});
	return provider.chat(env.LLM_MODEL);
}

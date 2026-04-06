import type { Persona } from "../model";

const BLANK_PROMPT = `你是一个智能的 AI 助手，具备网络搜索、学术检索、文档管理、食谱编辑等多种能力。`;

export const blankF: Persona = {
	name: "白板助手",
	voiceId: "bhJUNIXWQQ94l8eI2VUf",
	prompt: BLANK_PROMPT,
};

export const blankM: Persona = {
	name: "白板助手",
	voiceId: "DowyQ68vDpgFYdWVGjc3",
	prompt: BLANK_PROMPT,
};

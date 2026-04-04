/**
 * Provider-agnostic ChatModel using native fetch.
 * Works with any OpenAI-compatible API (OpenRouter, Ollama, vLLM, etc.)
 */

import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { BaseChatModel, type BaseChatModelCallOptions } from "@langchain/core/language_models/chat_models";
import { AIMessage, AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";

interface NativeChatModelParams {
	baseURL: string;
	apiKey: string;
	model: string;
	// biome-ignore lint/suspicious/noExplicitAny: tool definitions
	tools?: any[];
	parallelToolCalls?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: wire format
function toWire(msgs: BaseMessage[]): any[] {
	// biome-ignore lint/suspicious/noExplicitAny: wire
	const result: any[] = [];
	for (const m of msgs) {
		const type = m._getType();
		if (type === "system") result.push({ role: "system", content: m.content });
		else if (type === "human") result.push({ role: "user", content: m.content });
		else if (type === "ai") {
			// biome-ignore lint/suspicious/noExplicitAny: AI fields
			const ai = m as any;
			// biome-ignore lint/suspicious/noExplicitAny: wire
			const w: any = { role: "assistant", content: ai.content ?? "" };
			if (ai.tool_calls?.length) {
				w.tool_calls = ai.tool_calls.map((tc: { id: string; name: string; args: unknown }) => ({
					id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.args) },
				}));
			}
			result.push(w);
		} else if (type === "tool") {
			// biome-ignore lint/suspicious/noExplicitAny: tool fields
			const tm = m as any;
			result.push({ role: "tool", content: tm.content, tool_call_id: tm.tool_call_id });
		}
	}
	return result;
}

export class NativeChatModel extends BaseChatModel<BaseChatModelCallOptions> {
	private baseURL: string;
	private apiKey: string;
	private modelName: string;
	// biome-ignore lint/suspicious/noExplicitAny: tool definitions
	private tools: any[];
	private parallelToolCalls: boolean;

	constructor(params: NativeChatModelParams) {
		super({});
		this.baseURL = params.baseURL;
		this.apiKey = params.apiKey;
		this.modelName = params.model;
		this.tools = params.tools ?? [];
		this.parallelToolCalls = params.parallelToolCalls ?? false;
	}

	_llmType() { return "native-chat"; }

	/** Returns a NEW instance with tools bound (preserves streaming capability) */
	bindTools(
		// biome-ignore lint/suspicious/noExplicitAny: tool defs
		tools: any[],
		// biome-ignore lint/suspicious/noExplicitAny: options
		kwargs?: any,
	) {
		return new NativeChatModel({
			baseURL: this.baseURL,
			apiKey: this.apiKey,
			model: this.modelName,
			tools,
			parallelToolCalls: kwargs?.parallel_tool_calls ?? false,
		});
	}

	// biome-ignore lint/suspicious/noExplicitAny: API body
	private buildBody(messages: BaseMessage[], stream = false): Record<string, any> {
		// biome-ignore lint/suspicious/noExplicitAny: body
		const body: Record<string, any> = { model: this.modelName, messages: toWire(messages) };
		if (stream) body.stream = true;
		if (this.tools.length) {
			body.tools = this.tools;
			body.parallel_tool_calls = this.parallelToolCalls;
		}
		return body;
	}

	async _generate(messages: BaseMessage[], _options: this["ParsedCallOptions"]) {
		const body = this.buildBody(messages);
		const res = await fetch(`${this.baseURL}/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
			body: JSON.stringify(body),
		});
		if (!res.ok) throw new Error(`LLM API error ${res.status}: ${await res.text().catch(() => "")}`);
		// biome-ignore lint/suspicious/noExplicitAny: API response
		const data = (await res.json()) as any;
		const msg = data.choices?.[0]?.message;
		if (!msg) throw new Error("No choices in LLM response");
		const toolCalls = msg.tool_calls?.map(
			(tc: { id: string; function: { name: string; arguments: string } }) => ({
				id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments),
			}),
		);
		return { generations: [{ message: new AIMessage({ content: msg.content ?? "", tool_calls: toolCalls }), text: msg.content ?? "" }] };
	}

	async *_streamResponseChunks(
		messages: BaseMessage[],
		_options: this["ParsedCallOptions"],
		_runManager?: CallbackManagerForLLMRun,
	): AsyncGenerator<ChatGenerationChunk> {
		const body = this.buildBody(messages, true);
		const res = await fetch(`${this.baseURL}/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
			body: JSON.stringify(body),
		});
		if (!res.ok || !res.body) throw new Error(`LLM API error ${res.status}`);

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				if (!line.startsWith("data: ")) continue;
				const raw = line.slice(6).trim();
				if (raw === "[DONE]") return;
				try {
					const json = JSON.parse(raw);
					const delta = json.choices?.[0]?.delta;
					if (!delta) continue;
					const content = delta.content ?? "";
					const toolCallChunks = delta.tool_calls?.map(
						// biome-ignore lint/suspicious/noExplicitAny: SSE delta
						(tc: any) => ({
							index: tc.index, id: tc.id, name: tc.function?.name,
							args: tc.function?.arguments ?? "", type: "tool_call_chunk" as const,
						}),
					);
					const chunk = new AIMessageChunk({ content, tool_call_chunks: toolCallChunks });
					yield new ChatGenerationChunk({ message: chunk, text: content });
					await _runManager?.handleLLMNewToken(content);
				} catch { /* skip unparseable */ }
			}
		}
	}
}

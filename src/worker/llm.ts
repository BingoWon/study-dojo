/**
 * CF Workers-compatible streaming ChatModel using native fetch.
 * Replaces @langchain/openai's ChatOpenAI which depends on the `openai` npm
 * package (uses Node.js undici, incompatible with Workers).
 */

import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
	BaseChatModel,
	type BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import {
	AIMessage,
	AIMessageChunk,
	type BaseMessage,
} from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";

interface WorkersChatModelParams {
	baseURL: string;
	apiKey: string;
	model: string;
}

/** Convert LangChain BaseMessage to OpenAI wire format */
// biome-ignore lint/suspicious/noExplicitAny: flexible wire format
function toWire(msgs: BaseMessage[]): any[] {
	// biome-ignore lint/suspicious/noExplicitAny: wire message
	const result: any[] = [];
	for (const m of msgs) {
		const type = m._getType();
		if (type === "system") {
			result.push({ role: "system", content: m.content });
		} else if (type === "human") {
			result.push({ role: "user", content: m.content });
		} else if (type === "ai") {
			// biome-ignore lint/suspicious/noExplicitAny: AI message fields
			const ai = m as any;
			// biome-ignore lint/suspicious/noExplicitAny: wire msg
			const w: any = { role: "assistant", content: ai.content ?? "" };
			if (ai.tool_calls?.length) {
				w.tool_calls = ai.tool_calls.map(
					(tc: { id: string; name: string; args: unknown }) => ({
						id: tc.id,
						type: "function",
						function: {
							name: tc.name,
							arguments: JSON.stringify(tc.args),
						},
					}),
				);
			}
			result.push(w);
		} else if (type === "tool") {
			// biome-ignore lint/suspicious/noExplicitAny: tool message
			const tm = m as any;
			result.push({
				role: "tool",
				content: tm.content,
				tool_call_id: tm.tool_call_id,
			});
		}
	}
	return result;
}

export class WorkersChatModel extends BaseChatModel<BaseChatModelCallOptions> {
	private baseURL: string;
	private apiKey: string;
	private modelName: string;

	constructor(params: WorkersChatModelParams) {
		super({});
		this.baseURL = params.baseURL;
		this.apiKey = params.apiKey;
		this.modelName = params.model;
	}

	_llmType(): string {
		return "workers-chat";
	}

	/** Bind tool definitions — stores tools in call options for _generate/_stream */
	bindTools(
		// biome-ignore lint/suspicious/noExplicitAny: tool defs vary
		tools: any[],
		// biome-ignore lint/suspicious/noExplicitAny: bind options
		kwargs?: any,
	) {
		// Store tools on instance — LangGraph calls invoke() which calls _generate
		const copy = new WorkersChatModel({
			baseURL: this.baseURL,
			apiKey: this.apiKey,
			model: this.modelName,
		});
		copy._boundTools = tools;
		copy._parallelToolCalls = kwargs?.parallel_tool_calls ?? false;
		return copy;
	}

	/** @internal */
	// biome-ignore lint/suspicious/noExplicitAny: tool defs
	_boundTools: any[] = [];
	/** @internal */
	_parallelToolCalls = false;

	/** Non-streaming generate */
	async _generate(
		messages: BaseMessage[],
		_options: this["ParsedCallOptions"],
	) {
		// biome-ignore lint/suspicious/noExplicitAny: API body
		const body: Record<string, any> = {
			model: this.modelName,
			messages: toWire(messages),
		};
		if (this._boundTools.length) {
			body.tools = this._boundTools;
			body.parallel_tool_calls = this._parallelToolCalls;
		}

		const res = await fetch(`${this.baseURL}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`LLM API error ${res.status}: ${text}`);
		}
		// biome-ignore lint/suspicious/noExplicitAny: API response
		const data = (await res.json()) as any;
		const msg = data.choices?.[0]?.message;
		if (!msg) throw new Error("No choices in LLM response");

		const toolCalls = msg.tool_calls?.map(
			(tc: { id: string; function: { name: string; arguments: string } }) => ({
				id: tc.id,
				name: tc.function.name,
				args: JSON.parse(tc.function.arguments),
			}),
		);

		const aiMsg = new AIMessage({
			content: msg.content ?? "",
			tool_calls: toolCalls,
		});

		return { generations: [{ message: aiMsg, text: msg.content ?? "" }] };
	}

	/** Streaming: yields AIMessageChunk for each SSE delta from the API */
	async *_streamResponseChunks(
		messages: BaseMessage[],
		_options: this["ParsedCallOptions"],
		_runManager?: CallbackManagerForLLMRun,
	): AsyncGenerator<ChatGenerationChunk> {
		// biome-ignore lint/suspicious/noExplicitAny: API body
		const body: Record<string, any> = {
			model: this.modelName,
			messages: toWire(messages),
			stream: true,
		};
		if (this._boundTools.length) {
			body.tools = this._boundTools;
			body.parallel_tool_calls = this._parallelToolCalls;
		}

		const res = await fetch(`${this.baseURL}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
		});
		if (!res.ok || !res.body) {
			const text = await res.text().catch(() => "");
			throw new Error(`LLM API error ${res.status}: ${text}`);
		}

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
				const data = line.slice(6).trim();
				if (data === "[DONE]") return;

				try {
					const json = JSON.parse(data);
					const delta = json.choices?.[0]?.delta;
					if (!delta) continue;

					const content = delta.content ?? "";
					const toolCallChunks = delta.tool_calls?.map(
						// biome-ignore lint/suspicious/noExplicitAny: SSE delta shape
						(tc: any) => ({
							index: tc.index,
							id: tc.id,
							name: tc.function?.name,
							args: tc.function?.arguments ?? "",
							type: "tool_call_chunk" as const,
						}),
					);

					const chunk = new AIMessageChunk({
						content,
						tool_call_chunks: toolCallChunks,
					});

					yield new ChatGenerationChunk({
						message: chunk,
						text: content,
					});

					await _runManager?.handleLLMNewToken(content);
				} catch {
					// skip unparseable lines
				}
			}
		}
	}
}

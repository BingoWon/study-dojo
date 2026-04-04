import {
	BookOpen,
	Bot,
	Loader2,
	Paperclip,
	Send,
	Trash2,
	X,
} from "lucide-react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Recipe } from "./components/RecipePanel";
import { SearchCard } from "./components/tools/PaperSearchToolUI";

// ── Types ────────────────────────────────────────────────────────────────────

interface WirePart {
	type: string;
	text?: string;
	toolCallId?: string;
	toolName?: string;
	// biome-ignore lint/suspicious/noExplicitAny: flexible
	args?: any;
	// biome-ignore lint/suspicious/noExplicitAny: flexible
	result?: any;
}

interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	parts: WirePart[];
}

// ── SSE helpers ──────────────────────────────────────────────────────────────

function parseSSE(
	text: string,
	handler: (event: string, data: string) => void,
) {
	let currentEvent = "";
	for (const line of text.split("\n")) {
		if (line.startsWith("event: ")) {
			currentEvent = line.slice(7).trim();
		} else if (line.startsWith("data: ")) {
			handler(currentEvent, line.slice(6));
			currentEvent = "";
		}
	}
}

// ── Attachment helpers ──────────────────────────────────────────────────────���

interface Attachment {
	id: string;
	file: File;
	previewUrl: string;
	type: "image" | "document";
}

function readAsDataURL(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result as string);
		r.onerror = reject;
		r.readAsDataURL(file);
	});
}

// ── Main Chat ────────────────────────────────────────────────────────────────

export function Chat({
	threadId,
	onTitleUpdate,
	onRecipeUpdate,
	onLoadingChange,
}: {
	threadId: string;
	onTitleUpdate?: (title: string) => void;
	onRecipeUpdate: (partial: Partial<Recipe>) => void;
	onLoadingChange?: (loading: boolean) => void;
}) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [streaming, setStreaming] = useState(false);
	const [streamingText, setStreamingText] = useState("");
	const [interrupt, setInterrupt] = useState<{
		type: string;
		toolCallId: string;
		queries: string[];
		defaultTopK: number;
	} | null>(null);
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const [loaded, setLoaded] = useState(false);

	const viewportRef = useRef<HTMLDivElement>(null);
	const abortRef = useRef<AbortController | null>(null);
	const onTitleRef = useRef(onTitleUpdate);
	onTitleRef.current = onTitleUpdate;

	// ── Load messages ──────────────────────────────────────────────��───────
	useEffect(() => {
		setLoaded(false);
		setMessages([]);
		setInterrupt(null);
		setStreamingText("");

		fetch(`/api/threads/${threadId}/messages`)
			.then((r) => (r.ok ? r.json() : { messages: [] }))
			.then((raw: unknown) => {
				// biome-ignore lint/suspicious/noExplicitAny: API response shape
				const data = raw as any;
				setMessages(data.messages ?? []);
				if (data.interrupt) {
					setInterrupt(data.interrupt);
				}
				setLoaded(true);
			})
			.catch(() => setLoaded(true));
	}, [threadId]);

	// ── Auto-scroll ────────────────────────────────────────────────────────
	const scrollToBottom = useCallback(() => {
		viewportRef.current?.scrollTo({
			top: viewportRef.current.scrollHeight,
			behavior: "smooth",
		});
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: trigger scroll on state change
	useEffect(scrollToBottom, [
		messages,
		streamingText,
		interrupt,
		scrollToBottom,
	]);

	// ── Loading state ──────────────────────────────────────────────────────
	useEffect(() => {
		onLoadingChange?.(streaming);
	}, [streaming, onLoadingChange]);

	// ── Stream handler ─────────────────────────────────────────────────────
	const streamChat = useCallback(
		// biome-ignore lint/suspicious/noExplicitAny: resume value varies
		async (body: Record<string, any>) => {
			setStreaming(true);
			setStreamingText("");
			setInterrupt(null);

			const ctrl = new AbortController();
			abortRef.current = ctrl;

			try {
				const res = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ threadId, ...body }),
					signal: ctrl.signal,
				});

				if (!res.ok || !res.body) {
					throw new Error(`HTTP ${res.status}`);
				}

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				let accumulated = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const parts = buffer.split("\n\n");
					buffer = parts.pop() ?? "";

					for (const part of parts) {
						parseSSE(part, (event, raw) => {
							try {
								const data = JSON.parse(raw);

								switch (event) {
									case "delta":
										accumulated += data.content ?? "";
										setStreamingText(accumulated);
										break;

									case "tool-call":
										// Tool call complete — show inline
										break;

									case "recipe-update":
										onRecipeUpdate(data);
										break;

									case "interrupt":
										setInterrupt(data.value);
										break;

									case "messages":
										// Full message sync from server
										if (Array.isArray(data)) {
											setMessages(data);
										}
										break;

									case "title":
										onTitleRef.current?.(data.title);
										break;

									case "done":
										break;

									case "error":
										console.error("Chat error:", data.message);
										break;
								}
							} catch {
								// ignore parse errors
							}
						});
					}
				}

				// If we streamed text but no "messages" event, add it locally
				if (accumulated && !interrupt) {
					setMessages((prev) => [
						...prev,
						{
							id: crypto.randomUUID(),
							role: "assistant",
							parts: [{ type: "text", text: accumulated }],
						},
					]);
				}
			} catch (e) {
				if ((e as Error).name !== "AbortError") {
					console.error("Stream error:", e);
				}
			} finally {
				setStreamingText("");
				setStreaming(false);
				abortRef.current = null;
			}
		},
		[threadId, onRecipeUpdate, interrupt],
	);

	// ── Send message ───────────────────────────────────────────────────────
	const handleSend = useCallback(async () => {
		const text = input.trim();
		if (!text && attachments.length === 0) return;
		if (streaming) return;

		// Add user message locally
		const userMsg: ChatMessage = {
			id: crypto.randomUUID(),
			role: "user",
			parts: [{ type: "text", text: text || "(附件)" }],
		};
		setMessages((prev) => [...prev, userMsg]);
		setInput("");

		// Build attachments for server
		const atts = await Promise.all(
			attachments.map(async (a) => ({
				type: a.type,
				data: await readAsDataURL(a.file),
				mimeType: a.file.type,
			})),
		);
		setAttachments([]);

		await streamChat({
			message: text,
			...(atts.length > 0 ? { attachments: atts } : {}),
		});
	}, [input, attachments, streaming, streamChat]);

	// ── Resume interrupt ───────────────────────────────────────────────────
	const handleResume = useCallback(
		// biome-ignore lint/suspicious/noExplicitAny: resume value
		async (value: any) => {
			setInterrupt(null);
			await streamChat({ resume: value });
		},
		[streamChat],
	);

	// ── Stop streaming ─────────────────────────────────────────────────────
	const handleStop = useCallback(() => {
		abortRef.current?.abort();
	}, []);

	// ── File input ─────────────────────────────────────────────────────────
	const fileInputRef = useRef<HTMLInputElement>(null);
	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			if (!files) return;
			const newAtts: Attachment[] = [];
			for (const file of files) {
				const isImage = file.type.startsWith("image/");
				newAtts.push({
					id: crypto.randomUUID(),
					file,
					previewUrl: isImage ? URL.createObjectURL(file) : "",
					type: isImage ? "image" : "document",
				});
			}
			setAttachments((prev) => [...prev, ...newAtts]);
			e.target.value = "";
		},
		[],
	);

	if (!loaded) {
		return (
			<div className="h-full flex items-center justify-center">
				<Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-col relative overflow-hidden font-sans">
			{/* Messages */}
			<div
				ref={viewportRef}
				className="flex-1 overflow-y-auto px-3 py-6 scroll-smooth"
			>
				{messages.length === 0 && !streaming && (
					<EmptyState
						onSend={(t) => {
							setInput(t);
						}}
					/>
				)}

				{messages.map((msg) => (
					<MessageBubble key={msg.id} message={msg} />
				))}

				{/* Streaming assistant message */}
				{streaming && streamingText && (
					<AssistantBubble>
						<MarkdownBlock text={streamingText} />
					</AssistantBubble>
				)}

				{/* Streaming indicator */}
				{streaming && !streamingText && (
					<AssistantBubble>
						<div className="flex items-center gap-2 text-sm text-zinc-400">
							<Loader2 className="w-4 h-4 animate-spin" />
							思考中...
						</div>
					</AssistantBubble>
				)}

				{/* Interrupt card */}
				{interrupt && (
					<div className="mr-auto max-w-[85%] mb-6">
						<SearchCard
							queries={interrupt.queries ?? []}
							defaultTopK={interrupt.defaultTopK ?? 5}
							onRespond={handleResume}
						/>
					</div>
				)}
			</div>

			{/* Scroll to bottom */}
			{/* Input */}
			<div className="pb-4 pt-3 px-3 sticky bottom-0 bg-gradient-to-t from-white/50 via-white/40 dark:from-zinc-900/50 dark:via-zinc-900/40 to-transparent backdrop-blur-sm z-30">
				{/* Attachment previews */}
				{attachments.length > 0 && (
					<div className="flex flex-wrap gap-2 px-2 pb-2">
						{attachments.map((a) => (
							<div
								key={a.id}
								className="group relative flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2 border border-zinc-200 dark:border-zinc-700"
							>
								{a.previewUrl ? (
									<img
										src={a.previewUrl}
										alt=""
										className="h-10 w-10 rounded-lg object-cover"
									/>
								) : (
									<div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs">
										📄
									</div>
								)}
								<span className="truncate text-xs text-zinc-600 dark:text-zinc-300 max-w-[100px]">
									{a.file.name}
								</span>
								<button
									type="button"
									onClick={() =>
										setAttachments((p) => p.filter((x) => x.id !== a.id))
									}
									className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-400 dark:bg-zinc-600 text-white shadow hover:scale-110 cursor-pointer"
								>
									<X className="w-3 h-3" />
								</button>
							</div>
						))}
					</div>
				)}

				<form
					onSubmit={(e) => {
						e.preventDefault();
						handleSend();
					}}
					className="flex w-full flex-col rounded-2xl bg-white/70 dark:bg-zinc-800/70 p-2 shadow-sm border border-white/60 dark:border-zinc-700/50 backdrop-blur-xl transition-all focus-within:border-blue-400/40 focus-within:ring-2 focus-within:ring-blue-400/10"
				>
					<div className="flex items-end gap-1">
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 dark:text-zinc-500 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 active:scale-95 cursor-pointer"
							title="添加附件"
						>
							<Paperclip className="h-4 w-4" />
						</button>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*,application/pdf"
							multiple
							onChange={handleFileSelect}
							className="hidden"
						/>
						<input
							type="text"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder={interrupt ? "请先回复上方的确认卡片" : "输入消息..."}
							disabled={!!interrupt}
							className="flex-1 max-h-28 bg-transparent px-2 py-2.5 outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 text-sm leading-relaxed disabled:opacity-50"
						/>
						<div className="flex items-center gap-1 mb-0.5">
							{streaming ? (
								<button
									type="button"
									onClick={handleStop}
									className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-500 active:scale-95 cursor-pointer"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
							) : (
								<button
									type="submit"
									disabled={
										!!interrupt || (!input.trim() && attachments.length === 0)
									}
									className="flex h-8 w-10 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-40 cursor-pointer"
								>
									<Send className="h-3.5 w-3.5 ml-0.5" />
								</button>
							)}
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}

// ── Subcomponents ────────────────────────────────────────────────────────────

const EmptyState: FC<{ onSend: (text: string) => void }> = ({ onSend }) => (
	<div className="flex flex-col items-center justify-center h-full text-center px-4 select-none">
		<div className="text-4xl mb-4">🍳</div>
		<h2 className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mb-2">
			AI 食谱助手
		</h2>
		<p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6 max-w-xs">
			告诉我你想做什么菜，或者点击下方快速开始
		</p>
		<div className="flex flex-col gap-2 w-full max-w-xs">
			{[
				{ label: "意大利面", prompt: "做一道经典的意大利面" },
				{ label: "中式炒菜", prompt: "做一道简单的家常炒菜" },
				{ label: "健康沙拉", prompt: "做一份低卡健康沙拉" },
			].map((item) => (
				<button
					key={item.label}
					type="button"
					onClick={() => onSend(item.prompt)}
					className="text-left px-4 py-3 rounded-xl bg-white/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-sm text-zinc-700 dark:text-zinc-300"
				>
					🍽️ {item.label}
				</button>
			))}
		</div>
	</div>
);

const AssistantBubble: FC<{ children: React.ReactNode }> = ({ children }) => (
	<div className="mr-auto flex max-w-[85%] flex-col items-start mb-6 group">
		<div className="flex items-center gap-2 mb-2">
			<div className="relative h-6 w-6 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shadow-md dark:shadow-lg">
				<Bot className="w-3.5 h-3.5" />
			</div>
			<span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 tracking-wider">
				AI 助手
			</span>
		</div>
		<div className="w-full flex flex-col">{children}</div>
	</div>
);

const MarkdownBlock: FC<{ text: string }> = ({ text }) => (
	<div className="relative rounded-3xl rounded-tl-sm bg-zinc-900/80 px-6 py-4 text-zinc-200 shadow-xl border border-white/5 backdrop-blur-xl overflow-x-auto">
		<div className="prose prose-invert prose-sm prose-zinc max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 break-words">
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
		</div>
	</div>
);

const MessageBubble: FC<{ message: ChatMessage }> = ({ message }) => {
	if (message.role === "user") {
		const text = message.parts.find((p) => p.type === "text")?.text ?? "";
		return (
			<div className="ml-auto flex max-w-[85%] flex-col items-end mb-6">
				<div className="relative rounded-3xl rounded-tr-sm bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 px-6 py-4 text-zinc-900 dark:text-zinc-100 shadow-xl dark:shadow-2xl border border-zinc-300/50 dark:border-white/5 backdrop-blur-xl">
					<div className="leading-relaxed whitespace-pre-wrap text-sm">
						{text}
					</div>
				</div>
			</div>
		);
	}

	// Assistant message
	return (
		<AssistantBubble>
			{message.parts.map((part, i) => {
				const key = `${message.id}-${i}`;
				switch (part.type) {
					case "text":
						return <MarkdownBlock key={key} text={part.text ?? ""} />;
					case "tool-call":
						return (
							<ToolCallBadge
								key={key}
								name={part.toolName ?? ""}
								args={part.args}
								result={message.parts.find(
									(p) =>
										p.type === "tool-result" &&
										p.toolCallId === part.toolCallId,
								)}
							/>
						);
					case "tool-result":
						// Rendered as part of tool-call above
						return null;
					default:
						return null;
				}
			})}
		</AssistantBubble>
	);
};

// ── Tool call badges ─────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
	get_current_time: "🕐 获取时间",
	get_weather: "🌤️ 查询天气",
	search_web: "🔍 搜索网络",
	update_recipe: "🍳 更新食谱",
	rag_suggest: "📚 检索建议",
	rag_search: "📖 资料检索",
};

const ToolCallBadge: FC<{
	name: string;
	// biome-ignore lint/suspicious/noExplicitAny: tool args/result
	args: any;
	result?: WirePart;
}> = ({ name, result }) => {
	const label = TOOL_LABELS[name] ?? name;
	const hasResult = !!result;

	// Special rendering for rag_search results
	if (name === "rag_search" && hasResult) {
		const r = result?.result;
		const hasContext = r?.context && r.context !== "未找到相关内容";
		return (
			<div className="mb-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
				<BookOpen className="w-3.5 h-3.5 shrink-0" />
				{hasContext
					? `已从 ${r.papers ?? 0} 份资料中检索到相关内容`
					: r?.message || "未找到相关内容"}
			</div>
		);
	}

	return (
		<div
			className={`mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
				hasResult
					? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-700/30"
					: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-700/30 animate-pulse"
			}`}
		>
			{hasResult ? "✓" : <Loader2 className="w-3 h-3 animate-spin" />}
			{label}
		</div>
	);
};

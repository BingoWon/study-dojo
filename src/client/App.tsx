import type { UIMessage as Message } from "@ai-sdk/react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Chat } from "./Chat";
import { ThemeToggle } from "./components/ThemeToggle";
import { ThreadListSidebar } from "./components/ThreadListSidebar";
import { useThreads } from "./lib/useThreads";

function App() {
	const {
		threads,
		activeThreadId,
		setActiveThreadId,
		createThread,
		deleteThread,
		setThreadTitle,
		updateThreadTitle,
		loading,
	} = useThreads();

	const [initialMessages, setInitialMessages] = useState<Message[]>([]);
	const [chatReady, setChatReady] = useState(false);

	useEffect(() => {
		if (!activeThreadId) {
			setChatReady(false);
			return;
		}
		let cancelled = false;
		setChatReady(false);
		fetch(`/api/threads/${activeThreadId}/messages`)
			.then((res) => (res.ok ? res.json() : []))
			.then((msgs: unknown) => {
				if (cancelled) return;
				setInitialMessages(Array.isArray(msgs) ? (msgs as Message[]) : []);
				setChatReady(true);
			})
			.catch(() => {
				if (cancelled) return;
				setInitialMessages([]);
				setChatReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [activeThreadId]);

	const handleTitleUpdate = useCallback(
		(title: string) => {
			if (activeThreadId) setThreadTitle(activeThreadId, title);
		},
		[activeThreadId, setThreadTitle],
	);

	return (
		<main className="h-screen w-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30 flex transition-colors duration-300">
			<header className="absolute top-0 right-0 p-4 z-50 flex items-center justify-end gap-3">
				<ThemeToggle />
				<Show when="signed-in">
					<UserButton />
				</Show>
			</header>

			<Show when="signed-out">
				<div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full w-full">
					<div className="max-w-md w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
						<div className="w-20 h-20 bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm ring-1 ring-blue-500/20">
							<svg
								className="w-10 h-10"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								role="img"
								aria-label="AI 沙盒"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
						</div>
						<h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
							AI 沙盒
						</h1>
						<p className="text-zinc-500 dark:text-zinc-400 text-lg leading-relaxed">
							您的智能助手，准备就绪。登录以保存您的对话历史并体验所有高级功能。
						</p>

						<div className="flex flex-col sm:flex-row gap-3 pt-6 justify-center">
							<SignInButton mode="modal">
								<button
									type="button"
									className="flex-1 sm:flex-none flex items-center justify-center px-8 py-3.5 text-sm font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition cursor-pointer text-zinc-800 dark:text-zinc-100 ring-1 ring-zinc-300 dark:ring-zinc-700"
								>
									立即登录
								</button>
							</SignInButton>
							<SignUpButton mode="modal">
								<button
									type="button"
									className="flex-1 sm:flex-none flex items-center justify-center px-8 py-3.5 text-sm font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 rounded-full transition cursor-pointer shadow-lg shadow-zinc-900/20 dark:shadow-white/10"
								>
									免费注册
								</button>
							</SignUpButton>
						</div>
					</div>
				</div>
			</Show>

			<Show when="signed-in">
				<ThreadListSidebar
					threads={threads}
					activeThreadId={activeThreadId}
					onSelect={setActiveThreadId}
					onCreate={createThread}
					onDelete={deleteThread}
					onRename={updateThreadTitle}
				/>
				<div className="flex-1 relative h-full">
					{loading && (
						<div className="absolute inset-0 flex items-center justify-center">
							<Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
						</div>
					)}
					{!loading && activeThreadId && chatReady && (
						<Chat
							key={`${activeThreadId}-${initialMessages.length}`}
							threadId={activeThreadId}
							initialMessages={initialMessages}
							onTitleUpdate={handleTitleUpdate}
						/>
					)}
				</div>
			</Show>
		</main>
	);
}

export default App;

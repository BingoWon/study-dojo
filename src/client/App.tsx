import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import { Chat } from "./Chat";
import { ThreadListSidebar } from "./components/ThreadListSidebar";
import { ThemeToggle } from "./components/ThemeToggle";

function App() {
	return (
		<main className="h-screen w-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30 flex transition-colors duration-300">
			{/* Top Navigation Bar */}
			<header className="absolute top-0 right-0 p-4 z-50 flex items-center justify-end gap-3">
				<ThemeToggle />
				
				<Show when="signed-out">
					<div className="flex gap-2">
						<SignInButton mode="modal">
							<button className="flex items-center justify-center px-4 py-2 text-sm font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition cursor-pointer text-zinc-800 dark:text-zinc-100">
								登录
							</button>
						</SignInButton>
						<SignUpButton mode="modal">
							<button className="flex items-center justify-center px-4 py-2 text-sm font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 rounded-full transition cursor-pointer shadow">
								注册
							</button>
						</SignUpButton>
					</div>
				</Show>
				<Show when="signed-in">
					<UserButton />
				</Show>
			</header>
			
			<Show when="signed-in">
				<ThreadListSidebar />
				<div className="flex-1 relative h-full">
					<Chat />
				</div>
			</Show>
			
			<Show when="signed-out">
				<div className="flex-1 flex flex-col items-center justify-center text-center px-4 h-full">
					<div className="mb-8 w-24 h-24 rounded-3xl bg-zinc-200 dark:bg-zinc-900 border border-zinc-300 dark:border-white/5 flex items-center justify-center shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
						<span className="text-4xl text-zinc-500">🔒</span>
					</div>
					<h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-zinc-800 to-zinc-500 dark:from-white dark:to-zinc-500 mb-3 tracking-tight">
						需要身份验证
					</h1>
					<p className="text-zinc-500 dark:text-zinc-400 max-w-sm text-sm leading-relaxed mb-8">
						请登录以访问 AI 沙盒，并开始体验生成式智能交互。
					</p>
					<SignInButton mode="modal">
						<button className="px-6 py-3 text-sm font-bold bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90 rounded-full transition cursor-pointer shadow-lg">
							点击登录继续
						</button>
					</SignInButton>
				</div>
			</Show>
		</main>
	);
}

export default App;

import { AlertTriangle, RefreshCw } from "lucide-react";
import React, { type ReactNode } from "react";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error("ErrorBoundary caught an error:", error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="flex h-screen w-screen flex-col items-center justify-center bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 p-4 transition-colors">
					<div className="mb-6 w-16 h-16 rounded-3xl bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center justify-center shadow-lg dark:shadow-2xl">
						<AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-500" />
					</div>
					<h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-red-600 to-red-400 dark:from-red-400 dark:to-red-600 mb-3 tracking-wide">
						系统发生异常
					</h1>
					<p className="text-zinc-500 dark:text-zinc-400 max-w-md text-center text-sm leading-relaxed mb-6">
						{this.state.error?.message || "发生了未知错误。"}
					</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-red-600 text-white dark:bg-red-500/10 dark:text-red-400 hover:bg-red-700 dark:hover:bg-red-500/20 rounded-full transition cursor-pointer border border-transparent dark:border-red-500/30"
					>
						<RefreshCw className="w-4 h-4" />
						点击刷新
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}

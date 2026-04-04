import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import "@copilotkit/react-core/v2/styles.css";
import "./globals.css";

export const metadata = {
	title: "Roast Prof — AI 食谱助手",
	description: "智能食谱创建器，准备就绪",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="zh" suppressHydrationWarning>
			<body>
				<ClerkProvider afterSignOutUrl="/">
					{children}
				</ClerkProvider>
			</body>
		</html>
	);
}

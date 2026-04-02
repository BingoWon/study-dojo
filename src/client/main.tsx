import { ClerkProvider } from "@clerk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./components/ThemeProvider";
import "./index.css";

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
				<ErrorBoundary>
					{/* @ts-expect-error: comply with strict prompt instructions not to pass publishableKey */}
					<ClerkProvider afterSignOutUrl="/">
						<App />
					</ClerkProvider>
				</ErrorBoundary>
			</ThemeProvider>
		</StrictMode>,
	);
}

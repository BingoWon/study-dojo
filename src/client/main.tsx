import { ClerkProvider } from "@clerk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./components/ThemeProvider";
import "./index.css";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
				<ErrorBoundary>
					<ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
						<App />
					</ClerkProvider>
				</ErrorBoundary>
			</ThemeProvider>
		</StrictMode>,
	);
}

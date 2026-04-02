import { ClerkProvider } from "@clerk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const root = document.getElementById("root");

if (root) {
	createRoot(root).render(
		<StrictMode>
			<ErrorBoundary>
				<ClerkProvider
					publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
					afterSignOutUrl="/"
				>
					<App />
				</ClerkProvider>
			</ErrorBoundary>
		</StrictMode>,
	);
}

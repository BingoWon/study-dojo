import { ClerkProvider } from "@clerk/react";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./components/ThemeProvider";
import "./index.css";

const DevEffects = lazy(() => import("./DevEffects"));
const DevGlass = lazy(() => import("./DevGlass"));
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
const devPage = window.location.pathname.startsWith("/dev/")
	? window.location.pathname
	: null;

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
				<ErrorBoundary>
					{devPage === "/dev/effects" ? (
						<Suspense>
							<DevEffects />
						</Suspense>
					) : devPage === "/dev/glass" ? (
						<Suspense>
							<DevGlass />
						</Suspense>
					) : (
						<ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
							<App />
						</ClerkProvider>
					)}
				</ErrorBoundary>
			</ThemeProvider>
		</StrictMode>,
	);
}

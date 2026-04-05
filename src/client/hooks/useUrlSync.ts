import { useAui, useAuiState } from "@assistant-ui/react";
import { useCallback, useEffect, useRef } from "react";
import type { SidebarTab } from "../components/ThreadListSidebar";

/**
 * Syncs the active thread ID and sidebar tab with the browser URL.
 *
 * URL format:
 *   /                         → new thread, tab=chat
 *   /c/{threadId}             → specific thread, tab=chat
 *   /c/{threadId}?tab=library → specific thread, library tab
 *   /c/{threadId}?tab=memory  → specific thread, memory tab
 */
export function useUrlSync(
	sidebarTab: SidebarTab,
	setSidebarTab: (tab: SidebarTab) => void,
) {
	const aui = useAui();
	const mainThreadId = useAuiState((s) => s.threads.mainThreadId);
	const threadIds = useAuiState((s) => s.threads.threadIds);
	const initializedRef = useRef(false);

	// ── Read URL on mount → restore thread + tab ────────────────────────
	useEffect(() => {
		if (initializedRef.current || threadIds.length === 0) return;
		initializedRef.current = true;

		const path = window.location.pathname;
		const params = new URLSearchParams(window.location.search);

		// Restore tab
		const tab = params.get("tab");
		if (tab === "library" || tab === "memory") {
			setSidebarTab(tab);
		}

		// Restore thread from URL
		const match = path.match(/^\/c\/([a-f0-9-]+)$/i);
		if (match) {
			const urlThreadId = match[1];
			if (threadIds.includes(urlThreadId)) {
				if (urlThreadId !== mainThreadId) {
					aui.threads().switchToThread(urlThreadId);
				}
			} else {
				// Thread not found (invalid ID or no permission) → redirect to root
				window.history.replaceState(null, "", "/");
			}
		}
	}, [threadIds, mainThreadId, aui, setSidebarTab]);

	// ── Update URL when thread changes ──────────────────────────────────
	const updateUrl = useCallback(
		(threadId: string | undefined, tab: SidebarTab) => {
			const path = threadId ? `/c/${threadId}` : "/";
			const params = new URLSearchParams();
			if (tab !== "chat") params.set("tab", tab);
			const search = params.toString();
			const url = search ? `${path}?${search}` : path;

			if (url !== window.location.pathname + window.location.search) {
				window.history.replaceState(null, "", url);
			}
		},
		[],
	);

	// Derive remoteId from the main thread's state
	const mainRemoteId = useAuiState((s) => {
		const items = s.threads.threadItems as unknown as {
			id: string;
			remoteId?: string;
		}[];
		return items?.find?.((t) => t.id === s.threads.mainThreadId)?.remoteId;
	});

	// Sync on thread or tab change
	useEffect(() => {
		if (!initializedRef.current) return;
		updateUrl(mainRemoteId, sidebarTab);
	}, [mainRemoteId, sidebarTab, updateUrl]);
}

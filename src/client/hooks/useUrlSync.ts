import { useAui, useAuiState } from "@assistant-ui/react";
import { useCallback, useEffect, useRef } from "react";
import type { SidebarTab } from "../components/ThreadListSidebar";

type ThreadItem = { id: string; remoteId?: string };

/**
 * Syncs the active thread ID and sidebar tab with the browser URL.
 *
 * URL uses remoteId (server-side UUID), never local runtime IDs.
 *
 *   /                         → new thread, tab=chat
 *   /c/{remoteId}             → specific thread, tab=chat
 *   /c/{remoteId}?tab=library → specific thread, library tab
 *   /c/{remoteId}?tab=memory  → specific thread, memory tab
 */
export function useUrlSync(
	sidebarTab: SidebarTab,
	setSidebarTab: (tab: SidebarTab) => void,
) {
	const aui = useAui();
	const threadItems = useAuiState(
		(s) => s.threads.threadItems as unknown as ThreadItem[],
	);
	const mainThreadId = useAuiState((s) => s.threads.mainThreadId);
	const initializedRef = useRef(false);

	// ── Read URL on mount → restore thread + tab ────────────────────────
	useEffect(() => {
		if (initializedRef.current || !threadItems?.length) return;
		initializedRef.current = true;

		const path = window.location.pathname;
		const params = new URLSearchParams(window.location.search);

		// Restore tab
		const tab = params.get("tab");
		if (tab === "library" || tab === "memory") {
			setSidebarTab(tab);
		}

		// Restore thread by remoteId from URL
		const match = path.match(/^\/c\/([a-f0-9-]+)$/i);
		if (match) {
			const urlRemoteId = match[1];
			const found = threadItems.find((t) => t.remoteId === urlRemoteId);
			if (found && found.id !== mainThreadId) {
				aui.threads().switchToThread(found.id);
			} else if (!found) {
				window.history.replaceState(null, "", "/");
			}
		}
	}, [threadItems, mainThreadId, aui, setSidebarTab]);

	// ── Derive current main thread's remoteId ───────────────────────────
	const mainRemoteId = useAuiState((s) => {
		const items = s.threads.threadItems as unknown as ThreadItem[];
		return items?.find?.((t) => t.id === s.threads.mainThreadId)?.remoteId;
	});

	// ── Update URL when thread or tab changes ───────────────────────────
	const updateUrl = useCallback(
		(remoteId: string | undefined, tab: SidebarTab) => {
			const path = remoteId ? `/c/${remoteId}` : "/";
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

	useEffect(() => {
		if (!initializedRef.current) return;
		updateUrl(mainRemoteId, sidebarTab);
	}, [mainRemoteId, sidebarTab, updateUrl]);
}

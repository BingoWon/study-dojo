import { useAui, useAuiState } from "@assistant-ui/react";
import { useCallback, useEffect, useRef } from "react";
import type { SidebarTab } from "../components/ThreadListSidebar";

type ThreadItem = { id: string; remoteId?: string };

/**
 * Syncs the active thread ID and sidebar tab with the browser URL.
 *
 * URL uses remoteId (server-side UUID), never local runtime IDs.
 */
export function useUrlSync(
	sidebarTab: SidebarTab,
	setSidebarTab: (tab: SidebarTab) => void,
) {
	const aui = useAui();
	const threadItems = useAuiState(
		(s) => s.threads.threadItems as unknown as ThreadItem[],
	);
	const threadIds = useAuiState((s) => s.threads.threadIds);
	const mainThreadId = useAuiState((s) => s.threads.mainThreadId);
	const restoredRef = useRef(false);

	// ── Restore thread + tab from URL once threads are loaded ────────────
	useEffect(() => {
		if (restoredRef.current) return;
		// Wait until thread list has loaded from server
		if (!threadItems?.length && !threadIds?.length) return;
		restoredRef.current = true;

		const path = window.location.pathname;
		const params = new URLSearchParams(window.location.search);

		// Restore tab
		const tab = params.get("tab");
		if (tab === "library" || tab === "memory") {
			setSidebarTab(tab);
		}

		// Restore thread by remoteId from URL
		const match = path.match(/^\/c\/([a-f0-9-]+)$/i);
		if (!match) return;

		const urlRemoteId = match[1];

		// DEBUG
		console.log("[useUrlSync] restore attempt", {
			urlRemoteId,
			threadItemCount: threadItems?.length,
			threadIdCount: threadIds?.length,
			mainThreadId,
			threadItemRemoteIds: threadItems?.map((t) => t.remoteId),
			threadIds: threadIds?.slice(0, 5),
		});

		// Find the thread with this remoteId
		const found = threadItems?.find((t) => t.remoteId === urlRemoteId);
		if (!found) {
			const directMatch = threadIds?.includes(urlRemoteId);
			console.log("[useUrlSync] not found in items, direct match:", directMatch);
			if (directMatch) {
				if (urlRemoteId !== mainThreadId) {
					aui.threads().switchToThread(urlRemoteId);
				}
			} else {
				window.history.replaceState(null, "", "/");
			}
			return;
		}

		console.log("[useUrlSync] found:", { foundId: found.id, foundRemoteId: found.remoteId });
		if (found.id !== mainThreadId) {
			aui.threads().switchToThread(found.id);
		}
	}, [threadItems, threadIds, mainThreadId, aui, setSidebarTab]);

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
		if (!restoredRef.current) return;
		updateUrl(mainRemoteId, sidebarTab);
	}, [mainRemoteId, sidebarTab, updateUrl]);
}

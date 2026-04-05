import { useAui, useAuiState } from "@assistant-ui/react";
import { useCallback, useEffect, useRef } from "react";
import type { SidebarTab } from "../components/ThreadListSidebar";

type ThreadItem = { id: string; remoteId?: string };

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

	// ── Restore thread + tab from URL once server threads load ───────────
	useEffect(() => {
		if (restoredRef.current) return;
		if (!threadIds?.length) return;
		restoredRef.current = true;

		const path = window.location.pathname;
		const params = new URLSearchParams(window.location.search);

		const tab = params.get("tab");
		if (tab === "library" || tab === "memory") setSidebarTab(tab);

		const match = path.match(/^\/c\/([a-f0-9-]+)$/i);
		if (!match) return;

		const urlRemoteId = match[1];
		const found = threadItems?.find((t) => t.remoteId === urlRemoteId);
		if (found) {
			if (found.id !== mainThreadId) aui.threads().switchToThread(found.id);
		} else if (threadIds?.includes(urlRemoteId)) {
			if (urlRemoteId !== mainThreadId) aui.threads().switchToThread(urlRemoteId);
		} else {
			window.history.replaceState(null, "", "/");
		}
	}, [threadItems, threadIds, mainThreadId, aui, setSidebarTab]);

	// ── Update URL on thread/tab change ─────────────────────────────────
	const mainRemoteId = useAuiState((s) => {
		const items = s.threads.threadItems as unknown as ThreadItem[];
		return items?.find?.((t) => t.id === s.threads.mainThreadId)?.remoteId;
	});

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

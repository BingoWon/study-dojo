import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";

export interface Thread {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
}

function makeDraftThread(): Thread {
	const now = Math.floor(Date.now() / 1000);
	return {
		id: crypto.randomUUID(),
		title: "新对话",
		createdAt: now,
		updatedAt: now,
	};
}

export function useThreads() {
	const { userId } = useAuth();
	const [threads, setThreads] = useState<Thread[]>([]);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchThreads = useCallback(async () => {
		const res = await fetch("/api/threads");
		if (res.ok) return (await res.json()) as Thread[];
		return [];
	}, []);

	useEffect(() => {
		if (userId === undefined) return;
		if (!userId) {
			setThreads([]);
			setActiveThreadId(null);
			setLoading(false);
			return;
		}

		let cancelled = false;
		setLoading(true);

		(async () => {
			try {
				const data = await fetchThreads();
				if (cancelled) return;

				if (data.length === 0) {
					const draft = makeDraftThread();
					setThreads([draft]);
					setActiveThreadId(draft.id);
				} else {
					setThreads(data);
					setActiveThreadId(data[0].id);
				}
			} catch {
				if (!cancelled) {
					setThreads([]);
					setActiveThreadId(null);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [userId, fetchThreads]);

	useEffect(() => {
		if (activeThreadId === null && threads.length > 0 && !loading) {
			setActiveThreadId(threads[0].id);
		}
	}, [activeThreadId, threads, loading]);

	const createThread = useCallback(() => {
		const draft = makeDraftThread();
		setThreads((prev) => {
			const withoutEmptyDrafts = prev.filter((t) => t.title !== "新对话");
			return [draft, ...withoutEmptyDrafts];
		});
		setActiveThreadId(draft.id);
	}, []);

	const deleteThread = useCallback(
		async (id: string) => {
			setActiveThreadId((prev) => (prev === id ? null : prev));
			setThreads((prev) => prev.filter((t) => t.id !== id));

			try {
				const res = await fetch(`/api/threads/${id}`, { method: "DELETE" });
				if (!res.ok) throw new Error();
			} catch {
				const data = await fetchThreads();
				setThreads(data);
				if (data.length > 0) setActiveThreadId(data[0].id);
			}
		},
		[fetchThreads],
	);

	const setThreadTitle = useCallback((id: string, title: string) => {
		setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
	}, []);

	const updateThreadTitle = useCallback(
		(id: string, title: string) => {
			setThreadTitle(id, title);
			fetch(`/api/threads/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title }),
			}).catch(() => {});
		},
		[setThreadTitle],
	);

	const refreshThreads = useCallback(async () => {
		const data = await fetchThreads();
		setThreads((prev) => {
			const drafts = prev.filter(
				(t) => t.title === "新对话" && !data.some((d) => d.id === t.id),
			);
			return [...drafts, ...data];
		});
	}, [fetchThreads]);

	return {
		threads,
		activeThreadId,
		activeThread: threads.find((t) => t.id === activeThreadId) ?? null,
		setActiveThreadId,
		createThread,
		deleteThread,
		setThreadTitle,
		updateThreadTitle,
		refreshThreads,
		loading,
	};
}

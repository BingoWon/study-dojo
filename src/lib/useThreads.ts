import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

export interface Thread {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
}

interface RawThread {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
}

function makeDraftThread(): Thread {
	const now = new Date().toISOString();
	return { id: crypto.randomUUID(), title: "新对话", createdAt: now, updatedAt: now };
}

export function useThreads() {
	const { userId } = useAuth();
	const [threads, setThreads] = useState<Thread[]>([]);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchThreads = useCallback(async () => {
		const res = await fetch("/api/threads");
		if (!res.ok) return [];
		const raw = (await res.json()) as RawThread[];
		return raw.map((t) => ({ id: t.id, title: t.title, createdAt: t.created_at, updatedAt: t.updated_at }));
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

	return {
		threads,
		activeThreadId,
		setActiveThreadId,
		createThread,
		deleteThread,
		setThreadTitle,
		updateThreadTitle,
		loading,
	};
}

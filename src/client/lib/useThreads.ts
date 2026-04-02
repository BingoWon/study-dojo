import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";

export interface Thread {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
}

export function useThreads() {
	const { userId } = useAuth();
	const [threads, setThreads] = useState<Thread[]>([]);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

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
				const res = await fetch("/api/threads");
				if (cancelled) return;
				const data: Thread[] = res.ok ? await res.json() : [];

				if (data.length === 0) {
					const createRes = await fetch("/api/threads", { method: "POST" });
					if (cancelled) return;
					if (createRes.ok) {
						const thread: Thread = await createRes.json();
						setThreads([thread]);
						setActiveThreadId(thread.id);
					}
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
	}, [userId]);

	// Auto-select first thread when active is cleared
	useEffect(() => {
		if (activeThreadId === null && threads.length > 0 && !loading) {
			setActiveThreadId(threads[0].id);
		}
	}, [activeThreadId, threads, loading]);

	const createThread = useCallback(async () => {
		const res = await fetch("/api/threads", { method: "POST" });
		if (!res.ok) throw new Error("创建会话失败");
		const thread: Thread = await res.json();
		setThreads((prev) => [thread, ...prev]);
		setActiveThreadId(thread.id);
		return thread;
	}, []);

	const deleteThread = useCallback(async (id: string) => {
		await fetch(`/api/threads/${id}`, { method: "DELETE" });
		setActiveThreadId((prev) => (prev === id ? null : prev));
		setThreads((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const updateThreadTitle = useCallback((id: string, title: string) => {
		setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
		fetch(`/api/threads/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title }),
		}).catch(console.error);
	}, []);

	return {
		threads,
		activeThreadId,
		activeThread: threads.find((t) => t.id === activeThreadId) ?? null,
		setActiveThreadId,
		createThread,
		deleteThread,
		updateThreadTitle,
		loading,
	};
}

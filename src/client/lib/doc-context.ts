/**
 * Shared utility for reading the active document ID and building
 * a chat summary from recent messages. Used by both voice and dialogue modes.
 */

/** Read the currently active document ID from sessionStorage. */
export function getActiveDocId(): string | undefined {
	try {
		const raw = sessionStorage.getItem("center:activeTab");
		const activeTab = raw ? JSON.parse(raw) : "";
		return activeTab && activeTab !== "recipe" ? activeTab : undefined;
	} catch {
		return undefined;
	}
}

/** Read the active document's title from sessionStorage. */
export function getActiveDocTitle(): string {
	const docId = getActiveDocId();
	if (!docId) return "";
	try {
		const openDocs = JSON.parse(
			sessionStorage.getItem("center:openDocs") || "[]",
		) as { id: string; title: string }[];
		return openDocs.find((d) => d.id === docId)?.title ?? "";
	} catch {
		return "";
	}
}

/** Build a summary of recent chat messages for context injection. */
export function buildChatSummary(
	messages: readonly {
		role: string;
		content: readonly { type: string; text?: string }[];
	}[],
	maxMessages = 10,
): string {
	const recent = messages.slice(-maxMessages);
	if (recent.length === 0) return "";
	return recent
		.map((m) => {
			const text = m.content
				.filter((p): p is { type: "text"; text: string } => p.type === "text")
				.map((p) => p.text)
				.join(" ");
			return `${m.role === "user" ? "学生" : "导师"}：${text.slice(0, 200)}`;
		})
		.join("\n");
}

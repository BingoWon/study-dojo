import { sql } from "drizzle-orm";
import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

export const threads = sqliteTable("threads", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	title: text("title").notNull().default("新对话"),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.default(sql`(strftime('%s', 'now'))`),
	updatedAt: integer("updated_at", { mode: "number" })
		.notNull()
		.default(sql`(strftime('%s', 'now'))`),
});

export const messages = sqliteTable("messages", {
	id: text("id").primaryKey(),
	threadId: text("thread_id")
		.notNull()
		.references(() => threads.id, { onDelete: "cascade" }),
	role: text("role").notNull(),
	parts: text("parts", { mode: "json" }).notNull(),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.default(sql`(strftime('%s', 'now'))`),
});

/** Global shared papers, deduplicated by content hash. Never deleted. */
export const papers = sqliteTable("papers", {
	id: text("id").primaryKey(),
	hash: text("hash").notNull().unique(),
	r2Key: text("r2_key").notNull(),
	markdownR2Key: text("markdown_r2_key"),
	translatedR2Key: text("translated_r2_key"),
	lang: text("lang"),
	chunks: integer("chunks").notNull().default(0),
	status: text("status").notNull().default("uploading"),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.default(sql`(strftime('%s', 'now'))`),
});

/** Per-user paper links with independent titles. */
export const userPapers = sqliteTable(
	"user_papers",
	{
		userId: text("user_id").notNull(),
		paperId: text("paper_id")
			.notNull()
			.references(() => papers.id),
		title: text("title").notNull().default("新论文"),
		createdAt: integer("created_at", { mode: "number" })
			.notNull()
			.default(sql`(strftime('%s', 'now'))`),
	},
	(t) => [primaryKey({ columns: [t.userId, t.paperId] })],
);

/** RAG chunks belonging to a paper (no user_id). */
export const documents = sqliteTable("documents", {
	id: text("id").primaryKey(),
	content: text("content").notNull(),
	paperId: text("paper_id"),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.default(sql`(strftime('%s', 'now'))`),
});

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const documents = sqliteTable("documents", {
	id: text("id").primaryKey(),
	content: text("content").notNull(),
	source: text("source"),
	userId: text("user_id"),
	paperId: text("paper_id"),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.default(sql`(strftime('%s', 'now'))`),
});

export const papers = sqliteTable("papers", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	title: text("title").notNull(),
	r2Key: text("r2_key").notNull(),
	markdownR2Key: text("markdown_r2_key"),
	chunks: integer("chunks").notNull().default(0),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.default(sql`(strftime('%s', 'now'))`),
});

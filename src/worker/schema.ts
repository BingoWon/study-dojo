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

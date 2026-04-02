import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("New Conversation"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user, assistant, system, tool
  content: text("content", { mode: "json" }).notNull(), // text content or complex tool parts
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
});

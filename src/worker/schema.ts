import { sql } from "drizzle-orm";
import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { DEFAULT_PERSONA } from "./model";

export const threads = sqliteTable("threads", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	title: text("title").notNull().default("新对话"),
	persona: text("persona").notNull().default(DEFAULT_PERSONA),
	mode: text("mode", { enum: ["text", "voice"] })
		.notNull()
		.default("text"),
	docId: text("doc_id"),
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

/** Global shared documents, deduplicated by content hash. Never deleted. */
export const documents = sqliteTable("documents", {
	id: text("id").primaryKey(),
	hash: text("hash").notNull().unique(),
	r2Key: text("r2_key").notNull(),
	fileExt: text("file_ext"),
	markdownR2Key: text("markdown_r2_key"),
	translatedR2Key: text("translated_r2_key"),
	lang: text("lang"),
	chunks: integer("chunks").notNull().default(0),
	status: text("status").notNull().default("uploading"),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.default(sql`(strftime('%s', 'now'))`),
});

/** Per-user document links with independent titles. */
export const userDocuments = sqliteTable(
	"user_documents",
	{
		userId: text("user_id").notNull(),
		docId: text("doc_id")
			.notNull()
			.references(() => documents.id),
		title: text("title").notNull().default("新文档"),
		createdAt: integer("created_at", { mode: "number" })
			.notNull()
			.default(sql`(strftime('%s', 'now'))`),
	},
	(t) => [primaryKey({ columns: [t.userId, t.docId] })],
);

/** RAG chunks belonging to a document (no user_id). */
export const chunks = sqliteTable("chunks", {
	id: text("id").primaryKey(),
	content: text("content").notNull(),
	docId: text("doc_id"),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.default(sql`(strftime('%s', 'now'))`),
});

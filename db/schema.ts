import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const stateMeta = sqliteTable("state_meta", {
  key: text("key").primaryKey(),
  updatedAt: text("updated_at").notNull(),
  chunkCount: integer("chunk_count").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
});

export const stateChunks = sqliteTable("state_chunks", {
  key: text("key").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  value: text("value").notNull(),
}, (table) => [primaryKey({ columns: [table.key, table.chunkIndex] })]);

export const stateRevisions = sqliteTable("state_revisions", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  savedAt: text("saved_at").notNull(),
  chunkCount: integer("chunk_count").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
});

export const stateRevisionChunks = sqliteTable("state_revision_chunks", {
  revisionId: text("revision_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  value: text("value").notNull(),
}, (table) => [primaryKey({ columns: [table.revisionId, table.chunkIndex] })]);

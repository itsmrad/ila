import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { MessagePart } from "@ila/shared";
import { user } from "@/db/auth.schema";

/**
 * Chat persistence.
 *
 * Ownership is structural: every conversation carries a non-null `userId` with
 * a cascading foreign key, and messages only reach the API through a join on
 * their parent chat. There is no code path that reads a message without first
 * proving the requesting user owns the conversation.
 */

export const chat = pgTable(
  "chat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Model id used for the most recent turn (informational). */
    model: text("model").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Drives the history list: newest conversations for one owner. Includes
    // `id` because pagination orders and seeks on `(updatedAt, id)`.
    index("chat_userId_updatedAt_id_idx").on(
      table.userId,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const chatMessage = pgTable(
  "chatMessage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    /**
     * Denormalised owner. Redundant with `chat.userId` but lets every message
     * query carry its own ownership predicate (defence in depth).
     */
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    /** UIMessage-compatible parts, restricted to text/reasoning. */
    parts: jsonb("parts").$type<MessagePart[]>().notNull(),
    /** Monotonic ordering within a conversation. */
    sequence: integer("sequence").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Enforces gap-free, collision-free ordering per conversation at the
    // database level, not just in application code.
    uniqueIndex("chatMessage_chatId_sequence_key").on(table.chatId, table.sequence),
    index("chatMessage_userId_idx").on(table.userId),
  ],
);

/**
 * Fixed-window counters for application API rate limits.
 *
 * Separate from Better Auth's own `rateLimit` table so auth throttling and
 * product throttling cannot evict one another. Stored in Postgres so limits
 * hold across restarts and multiple backend instances.
 */
export const apiRateLimit = pgTable("apiRateLimit", {
  /** `<bucket>:<subject>` — e.g. `chat:usr_123`. */
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  /** Epoch milliseconds at which the current window started. */
  windowStart: bigint("windowStart", { mode: "number" }).notNull(),
});

export type ChatRow = typeof chat.$inferSelect;
export type ChatMessageRow = typeof chatMessage.$inferSelect;

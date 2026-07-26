import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { IntegrationApp, LlmProvider } from "@ila/shared";
import { user } from "@/db/auth.schema";

/**
 * User settings that must not live in the browser: third-party integrations and
 * BYOK provider keys.
 *
 * Both tables are keyed by `(userId, …)` with a cascading foreign key, so a
 * deleted account takes its credentials with it and no query can reach another
 * user's row without an explicit `userId` predicate.
 */

/**
 * One row per connected third-party app.
 *
 * Deliberately holds no tokens: the OAuth/Composio credential is owned by the
 * provider integration (added in a later stage) and referenced by
 * `externalAccountId`. This table records only *that* a connection exists.
 */
export const userIntegration = pgTable(
  "userIntegration",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    app: text("app").$type<IntegrationApp>().notNull(),
    /** Opaque account/connection id at the integration provider. */
    externalAccountId: text("externalAccountId"),
    connectedAt: timestamp("connectedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.app] }),
    index("userIntegration_userId_idx").on(table.userId),
  ],
);

/**
 * A user's own LLM provider key, encrypted with AES-256-GCM (see
 * `lib/crypto.ts`). Only the ciphertext is stored, and it is never returned to a
 * client — the API exposes existence and timestamps only.
 */
export const userLlmKey = pgTable(
  "userLlmKey",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").$type<LlmProvider>().notNull(),
    /** `v1.<iv>.<tag>.<ciphertext>` produced by `encryptSecret`. */
    encryptedKey: text("encryptedKey").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.provider] }),
    index("userLlmKey_userId_idx").on(table.userId),
  ],
);

export type UserIntegrationRow = typeof userIntegration.$inferSelect;
export type UserLlmKeyRow = typeof userLlmKey.$inferSelect;

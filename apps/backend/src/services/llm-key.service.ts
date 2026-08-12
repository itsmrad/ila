import { and, eq } from "drizzle-orm";
import type { LlmKeySummary, LlmProvider } from "@ila/shared";
import { db } from "@/db";
import { userLlmKey } from "@/db/settings.schema";
import { encryptSecret } from "@/lib/crypto";
import { NotFoundError } from "@/lib/errors";

/**
 * BYOK provider keys.
 *
 * The plaintext key exists only as the `apiKey` argument to {@link saveLlmKey};
 * it is encrypted before it touches the database and is never read back by any
 * code path in this stage. Nothing here returns key material, so a bug in a
 * route cannot leak one.
 */

/**
 * Additional authenticated data binding a ciphertext to its owner and provider.
 * A row copied to another user or relabelled to another provider fails GCM
 * authentication instead of decrypting.
 */
function keyAad(userId: string, provider: LlmProvider): string {
  return `llmKey:${userId}:${provider}`;
}

function toSummary(row: {
  provider: LlmProvider;
  createdAt: Date;
  updatedAt: Date;
}): LlmKeySummary {
  return {
    provider: row.provider,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Which providers the caller has stored a key for. Never the keys themselves. */
export async function listLlmKeys(userId: string): Promise<LlmKeySummary[]> {
  const rows = await db
    .select({
      provider: userLlmKey.provider,
      createdAt: userLlmKey.createdAt,
      updatedAt: userLlmKey.updatedAt,
    })
    .from(userLlmKey)
    .where(eq(userLlmKey.userId, userId));

  return rows.map(toSummary);
}

/** Store (or replace) the caller's key for one provider. */
export async function saveLlmKey(input: {
  userId: string;
  provider: LlmProvider;
  apiKey: string;
}): Promise<LlmKeySummary> {
  const encryptedKey = encryptSecret(
    input.apiKey,
    keyAad(input.userId, input.provider),
  );
  const now = new Date();

  const [row] = await db
    .insert(userLlmKey)
    .values({
      userId: input.userId,
      provider: input.provider,
      encryptedKey,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userLlmKey.userId, userLlmKey.provider],
      set: { encryptedKey, updatedAt: now },
    })
    .returning({
      provider: userLlmKey.provider,
      createdAt: userLlmKey.createdAt,
      updatedAt: userLlmKey.updatedAt,
    });

  if (!row) throw new Error("Failed to store the provider key");
  return toSummary(row);
}

/** Delete the caller's key for one provider. 404 when there is nothing stored. */
export async function deleteLlmKey(input: {
  userId: string;
  provider: LlmProvider;
}): Promise<void> {
  const deleted = await db
    .delete(userLlmKey)
    .where(
      and(
        eq(userLlmKey.userId, input.userId),
        eq(userLlmKey.provider, input.provider),
      ),
    )
    .returning({ provider: userLlmKey.provider });

  if (deleted.length === 0) {
    throw new NotFoundError("No key is stored for that provider.");
  }
}

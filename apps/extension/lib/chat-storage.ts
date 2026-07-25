import { z } from 'zod';
import { CHAT_LIMITS, chatRoleSchema, messagePartSchema } from '@ila/shared';

/**
 * Local persistence of the in-progress conversation.
 *
 * The side panel is torn down whenever the user closes it, so the current
 * transcript is mirrored into `chrome.storage.local` and restored on mount.
 * Server-side history remains the source of truth; this is only a convenience
 * cache.
 *
 * The cache is keyed by user id and cleared on sign-out so a second account
 * signing in on the same browser profile never sees the previous user's
 * transcript.
 */

const STORAGE_PREFIX = 'ila.chat.session.';

/** Keep the stored payload small: recent turns only, text/reasoning only. */
const MAX_STORED_MESSAGES = 40;

/** Must match `storedMessageSchema.id`. */
const MAX_STORED_ID_CHARS = 64;

const storedMessageSchema = z.object({
  id: z.string().min(1).max(MAX_STORED_ID_CHARS),
  role: chatRoleSchema,
  parts: z.array(messagePartSchema).min(1).max(CHAT_LIMITS.maxPartsPerMessage),
});

const storedSessionSchema = z.object({
  version: z.literal(1),
  chatId: z.string().uuid().optional(),
  model: z.string().max(120).optional(),
  messages: z.array(storedMessageSchema).max(MAX_STORED_MESSAGES),
  savedAt: z.number().int().nonnegative(),
});

export type StoredMessage = z.infer<typeof storedMessageSchema>;
export type StoredSession = z.infer<typeof storedSessionSchema>;

function keyFor(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/** Restore the cached conversation, or `null` when absent/unreadable. */
export async function loadChatSession(
  userId: string,
): Promise<StoredSession | null> {
  const key = keyFor(userId);
  try {
    const stored = await chrome.storage.local.get(key);
    // Anything unrecognised (older schema, manual tampering) is discarded
    // rather than trusted.
    const parsed = storedSessionSchema.safeParse(stored[key]);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Persist the conversation, trimming it to the storage budget first. */
export async function saveChatSession(
  userId: string,
  session: {
    chatId?: string;
    model?: string;
    messages: ReadonlyArray<{ id: string; role: string; parts: unknown }>;
  },
): Promise<void> {
  const messages: StoredMessage[] = [];

  for (const message of session.messages.slice(-MAX_STORED_MESSAGES)) {
    const role = chatRoleSchema.safeParse(message.role);
    if (!role.success) continue;

    const parts = Array.isArray(message.parts)
      ? message.parts
          .map((part) => messagePartSchema.safeParse(part))
          .flatMap((result) => (result.success ? [result.data] : []))
          .filter((part) => part.text.trim().length > 0)
          .slice(0, CHAT_LIMITS.maxPartsPerMessage)
          .map((part) => ({
            type: part.type,
            text: part.text.slice(0, CHAT_LIMITS.maxMessageChars),
          }))
      : [];

    if (parts.length === 0) continue;
    messages.push({
      // Clamp rather than drop: an over-long id would fail validation below and
      // cost the user the entire cached transcript.
      id: message.id.slice(0, MAX_STORED_ID_CHARS),
      role: role.data,
      parts,
    });
  }

  const payload = {
    version: 1 as const,
    ...(session.chatId ? { chatId: session.chatId } : {}),
    ...(session.model ? { model: session.model } : {}),
    messages,
    savedAt: Date.now(),
  };

  // Validate before writing so a payload that could not be read back is never
  // persisted in the first place.
  const validated = storedSessionSchema.safeParse(payload);
  if (!validated.success) return;

  try {
    await chrome.storage.local.set({ [keyFor(userId)]: validated.data });
  } catch {
    // Quota or extension-context errors must never break the chat UI.
  }
}

/** Drop the cached conversation for one user. */
export async function clearChatSession(userId: string): Promise<void> {
  try {
    await chrome.storage.local.remove(keyFor(userId));
  } catch {
    // Ignore — nothing the user can act on.
  }
}

/** Drop every cached conversation (used on sign-out). */
export async function clearAllChatSessions(): Promise<void> {
  try {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith(STORAGE_PREFIX));
    if (keys.length > 0) await chrome.storage.local.remove(keys);
  } catch {
    // Ignore.
  }
}

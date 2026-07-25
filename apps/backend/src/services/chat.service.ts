import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import {
  CHAT_LIMITS,
  deriveChatTitle,
  messagePartSchema,
  type ChatDetailResponse,
  type ChatMessage,
  type ChatRole,
  type ChatSummary,
  type ListChatsResponse,
  type MessagePart,
} from "@ila/shared";
import { db } from "@/db";
import { chat, chatMessage, type ChatRow } from "@/db/chat.schema";
import { NotFoundError } from "@/lib/errors";

/**
 * Chat persistence service.
 *
 * Every exported function takes the authenticated `userId` and applies it as a
 * SQL predicate. A chat that exists but belongs to another user is reported as
 * `404 NOT_FOUND` rather than `403`, so the API does not confirm the existence
 * of other users' conversations.
 */

function toSummary(row: ChatRow): ChatSummary {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Normalise message parts before they are persisted or replayed.
 *
 * Drops unknown part types, empty text, and anything past the configured caps.
 * This is the single choke point that keeps stored JSON inside the contract, so
 * a provider that starts emitting new part kinds cannot grow rows unbounded.
 */
export function normaliseParts(parts: unknown): MessagePart[] {
  if (!Array.isArray(parts)) return [];

  const normalised: MessagePart[] = [];
  for (const candidate of parts) {
    if (normalised.length >= CHAT_LIMITS.maxPartsPerMessage) break;
    const parsed = messagePartSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const text = parsed.data.text.slice(0, CHAT_LIMITS.maxMessageChars).trim();
    if (!text) continue;
    normalised.push({ type: parsed.data.type, text });
  }
  return normalised;
}

/** Create a conversation owned by `userId`. */
export async function createChat(input: {
  userId: string;
  firstMessageText: string;
  model: string;
}): Promise<ChatRow> {
  const [row] = await db
    .insert(chat)
    .values({
      userId: input.userId,
      title: deriveChatTitle(input.firstMessageText),
      model: input.model,
    })
    .returning();

  if (!row) throw new Error("Failed to create chat");
  return row;
}

/** Load a conversation, proving ownership. Throws 404 when not owned. */
export async function getOwnedChat(
  userId: string,
  chatId: string,
): Promise<ChatRow> {
  const [row] = await db
    .select()
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!row) throw new NotFoundError("Chat not found");
  return row;
}

/**
 * Append a message to a conversation.
 *
 * Runs inside a transaction that locks the parent chat row, which serialises
 * concurrent appends and keeps `sequence` gap-free and collision-free.
 */
export async function appendMessage(input: {
  userId: string;
  chatId: string;
  role: ChatRole;
  parts: MessagePart[];
  /** Also bump the chat's `updatedAt` and remember the model used. */
  model?: string;
}): Promise<{ id: string; createdAt: Date; sequence: number }> {
  const parts = normaliseParts(input.parts);
  if (parts.length === 0) {
    throw new Error("Refusing to persist a message with no usable content");
  }

  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: chat.id })
      .from(chat)
      .where(and(eq(chat.id, input.chatId), eq(chat.userId, input.userId)))
      .limit(1)
      .for("update");

    if (!owned) throw new NotFoundError("Chat not found");

    const [{ next } = { next: 1 }] = await tx
      .select({
        next: sql<number>`coalesce(max(${chatMessage.sequence}), 0) + 1`,
      })
      .from(chatMessage)
      .where(eq(chatMessage.chatId, input.chatId));

    const [inserted] = await tx
      .insert(chatMessage)
      .values({
        chatId: input.chatId,
        userId: input.userId,
        role: input.role,
        parts,
        sequence: Number(next),
      })
      .returning({
        id: chatMessage.id,
        createdAt: chatMessage.createdAt,
        sequence: chatMessage.sequence,
      });

    if (!inserted) throw new Error("Failed to persist chat message");

    await tx
      .update(chat)
      .set({
        updatedAt: new Date(),
        ...(input.model ? { model: input.model } : {}),
      })
      .where(and(eq(chat.id, input.chatId), eq(chat.userId, input.userId)));

    return inserted;
  });
}

/**
 * Messages of a conversation in order, capped to the most recent
 * `maxModelMessages` so a long history cannot blow up the upstream request.
 */
export async function getConversationMessages(input: {
  userId: string;
  chatId: string;
  limit?: number;
}): Promise<ChatMessage[]> {
  const limit = input.limit ?? CHAT_LIMITS.maxModelMessages;

  const rows = await db
    .select({
      id: chatMessage.id,
      role: chatMessage.role,
      parts: chatMessage.parts,
      createdAt: chatMessage.createdAt,
      sequence: chatMessage.sequence,
    })
    .from(chatMessage)
    .where(
      and(eq(chatMessage.chatId, input.chatId), eq(chatMessage.userId, input.userId)),
    )
    .orderBy(desc(chatMessage.sequence))
    .limit(limit);

  return rows
    .reverse()
    .map((row) => ({
      id: row.id,
      role: row.role,
      parts: normaliseParts(row.parts),
      createdAt: row.createdAt.toISOString(),
    }))
    .filter((message) => message.parts.length > 0);
}

/** All messages of a conversation, oldest first, for the history detail view. */
export async function getChatDetail(input: {
  userId: string;
  chatId: string;
}): Promise<ChatDetailResponse> {
  const owned = await getOwnedChat(input.userId, input.chatId);

  const rows = await db
    .select({
      id: chatMessage.id,
      role: chatMessage.role,
      parts: chatMessage.parts,
      createdAt: chatMessage.createdAt,
    })
    .from(chatMessage)
    .where(
      and(eq(chatMessage.chatId, owned.id), eq(chatMessage.userId, input.userId)),
    )
    .orderBy(asc(chatMessage.sequence));

  return {
    chat: toSummary(owned),
    messages: rows
      .map((row) => ({
        id: row.id,
        role: row.role,
        parts: normaliseParts(row.parts),
        createdAt: row.createdAt.toISOString(),
      }))
      .filter((message) => message.parts.length > 0),
  };
}

/** Newest-first page of the caller's conversations. */
export async function listChats(input: {
  userId: string;
  limit: number;
  cursor?: string;
}): Promise<ListChatsResponse> {
  const cursorDate = input.cursor ? new Date(input.cursor) : undefined;

  const rows = await db
    .select()
    .from(chat)
    .where(
      cursorDate && !Number.isNaN(cursorDate.getTime())
        ? and(eq(chat.userId, input.userId), lt(chat.updatedAt, cursorDate))
        : eq(chat.userId, input.userId),
    )
    .orderBy(desc(chat.updatedAt))
    // Fetch one extra row to detect whether another page exists.
    .limit(input.limit + 1);

  const page = rows.slice(0, input.limit);
  const hasMore = rows.length > input.limit;
  const last = page.at(-1);

  return {
    chats: page.map(toSummary),
    nextCursor: hasMore && last ? last.updatedAt.toISOString() : null,
  };
}

/**
 * Remove the trailing assistant message of a conversation, if any.
 *
 * Used by the retry path so regenerating a reply replaces the previous one
 * instead of stacking two assistant turns.
 */
export async function dropTrailingAssistantMessage(input: {
  userId: string;
  chatId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: chat.id })
      .from(chat)
      .where(and(eq(chat.id, input.chatId), eq(chat.userId, input.userId)))
      .limit(1)
      .for("update");

    if (!owned) throw new NotFoundError("Chat not found");

    const [last] = await tx
      .select({ id: chatMessage.id, role: chatMessage.role })
      .from(chatMessage)
      .where(
        and(
          eq(chatMessage.chatId, input.chatId),
          eq(chatMessage.userId, input.userId),
        ),
      )
      .orderBy(desc(chatMessage.sequence))
      .limit(1);

    if (!last || last.role !== "assistant") return false;

    await tx
      .delete(chatMessage)
      .where(
        and(eq(chatMessage.id, last.id), eq(chatMessage.userId, input.userId)),
      );
    return true;
  });
}

/** Delete a conversation (messages cascade). Throws 404 when not owned. */
export async function deleteChat(input: {
  userId: string;
  chatId: string;
}): Promise<void> {
  const deleted = await db
    .delete(chat)
    .where(and(eq(chat.id, input.chatId), eq(chat.userId, input.userId)))
    .returning({ id: chat.id });

  if (deleted.length === 0) throw new NotFoundError("Chat not found");
}

/** Delete every conversation belonging to the caller. */
export async function deleteAllChats(userId: string): Promise<number> {
  const deleted = await db
    .delete(chat)
    .where(eq(chat.userId, userId))
    .returning({ id: chat.id });
  return deleted.length;
}

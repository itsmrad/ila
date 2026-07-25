import { z } from "zod";

/**
 * Wire contract for the ILA chat API.
 *
 * This module is the single source of truth shared by the backend (request
 * validation + response serialisation) and the browser extension (response
 * parsing). Both sides import the same schemas, so a contract change surfaces
 * as a type error rather than a runtime surprise.
 */

/* -------------------------------------------------------------------------- */
/* Limits                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Hard limits enforced on both sides. The client uses them for affordances
 * (counters, disabled buttons); the server treats them as security boundaries
 * and rejects anything larger.
 */
export const CHAT_LIMITS = {
  /** Max characters in a single user message. */
  maxMessageChars: 8_000,
  /** Max text parts accepted in one inbound message. */
  maxPartsPerMessage: 8,
  /** Max characters of page context attached to a request. */
  maxPageContextChars: 4_000,
  /** Max stored title length. */
  maxTitleChars: 120,
  /** Max prior messages replayed to the model (oldest are dropped). */
  maxModelMessages: 40,
  /** Page size for the chat history list. */
  historyPageSize: 30,
  /** Max chats returned in a single history page. */
  maxHistoryPageSize: 100,
} as const;

/**
 * Response header carrying the server-assigned chat id for a streaming
 * request. The client reads it to bind a brand-new conversation to its
 * persisted row without ever choosing the id itself.
 */
export const CHAT_ID_HEADER = "x-ila-chat-id";

/* -------------------------------------------------------------------------- */
/* Message parts                                                               */
/* -------------------------------------------------------------------------- */

/** Text part — the only part type a client may send. */
export const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(CHAT_LIMITS.maxMessageChars),
});

/** Model reasoning part — server-produced only. */
export const reasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string().max(CHAT_LIMITS.maxMessageChars),
});

/** Parts that are persisted and replayed. Anything else is dropped. */
export const messagePartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  reasoningPartSchema,
]);

export type MessagePart = z.infer<typeof messagePartSchema>;

export const chatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof chatRoleSchema>;

/** A persisted chat message as returned by the API. */
export const chatMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: chatRoleSchema,
  parts: z.array(messagePartSchema).min(1).max(CHAT_LIMITS.maxPartsPerMessage),
  createdAt: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/* -------------------------------------------------------------------------- */
/* Streaming request (POST /api/chat)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Optional, untrusted context about the page the user is looking at.
 * Treated as data (never as instructions) by the system prompt.
 */
export const pageContextSchema = z.object({
  title: z.string().max(300).optional(),
  url: z
    .string()
    .url()
    .max(2_048)
    // Only web pages. Rejects `javascript:`, `data:`, and `file:` URLs, which
    // would otherwise reach the model (and could leak local paths).
    .refine(
      (value) => /^https?:\/\//i.test(value),
      "url must be an http(s) URL",
    )
    .optional(),
});

export type PageContext = z.infer<typeof pageContextSchema>;

/**
 * Inbound message for a streaming turn.
 *
 * Only the newest user message is accepted. Prior turns are read from the
 * database, so a client cannot forge assistant history (a prompt-injection and
 * billing-abuse vector) or replay another user's conversation.
 */
export const inboundUserMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.literal("user"),
  parts: z.array(textPartSchema).min(1).max(CHAT_LIMITS.maxPartsPerMessage),
});

export type InboundUserMessage = z.infer<typeof inboundUserMessageSchema>;

export const sendMessageRequestSchema = z
  .object({
    /** Existing conversation to append to. Omitted for the first turn. */
    chatId: z.string().uuid().optional(),
    /** The new user turn. Omitted only when `retry` is true. */
    message: inboundUserMessageSchema.optional(),
    /**
     * Re-run the last turn of an existing conversation without adding a new
     * user message. Used by the "try again" affordance after a failed stream.
     */
    retry: z.boolean().optional(),
    /** Requested model id. Must be in the server-side allowlist. */
    model: z.string().min(1).max(120).optional(),
    pageContext: pageContextSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.retry) {
      if (!value.chatId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["chatId"],
          message: "chatId is required when retrying",
        });
      }
      return;
    }
    if (!value.message) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "message is required",
      });
    }
  });

export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

/* -------------------------------------------------------------------------- */
/* History (GET/DELETE /api/chat)                                              */
/* -------------------------------------------------------------------------- */

export const chatSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  model: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ChatSummary = z.infer<typeof chatSummarySchema>;

export const listChatsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHAT_LIMITS.maxHistoryPageSize)
    .default(CHAT_LIMITS.historyPageSize),
  /** ISO timestamp of the last item on the previous page. */
  cursor: z.string().datetime().optional(),
});

export type ListChatsQuery = z.infer<typeof listChatsQuerySchema>;

export const listChatsResponseSchema = z.object({
  chats: z.array(chatSummarySchema),
  /** Pass as `cursor` to fetch the next page; `null` when exhausted. */
  nextCursor: z.string().nullable(),
});

export type ListChatsResponse = z.infer<typeof listChatsResponseSchema>;

export const chatDetailResponseSchema = z.object({
  chat: chatSummarySchema,
  messages: z.array(chatMessageSchema),
});

export type ChatDetailResponse = z.infer<typeof chatDetailResponseSchema>;

export const deleteChatResponseSchema = z.object({
  id: z.string().uuid(),
  deleted: z.literal(true),
});

export type DeleteChatResponse = z.infer<typeof deleteChatResponseSchema>;

export const chatIdParamsSchema = z.object({
  chatId: z.string().uuid(),
});

/* -------------------------------------------------------------------------- */
/* Models (GET /api/chat/models)                                               */
/* -------------------------------------------------------------------------- */

export const chatModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  default: z.boolean(),
});

export type ChatModel = z.infer<typeof chatModelSchema>;

export const listModelsResponseSchema = z.object({
  models: z.array(chatModelSchema).min(1),
});

export type ListModelsResponse = z.infer<typeof listModelsResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/** Envelope produced by the backend error handler. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Concatenate the text of every text part in a message. */
export function messageText(message: {
  parts: ReadonlyArray<MessagePart>;
}): string {
  return message.parts
    .filter((part): part is z.infer<typeof textPartSchema> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/** Derive a short, single-line conversation title from the first user message. */
export function deriveChatTitle(text: string): string {
  const normalised = text.replace(/\s+/g, " ").trim();
  if (!normalised) return "New chat";
  return normalised.length > CHAT_LIMITS.maxTitleChars
    ? `${normalised.slice(0, CHAT_LIMITS.maxTitleChars - 1)}…`
    : normalised;
}

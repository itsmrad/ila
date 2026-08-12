import {
  apiErrorSchema,
  chatDetailResponseSchema,
  deleteChatResponseSchema,
  listChatsResponseSchema,
  listModelsResponseSchema,
  type ChatDetailResponse,
  type ChatModel,
  type ListChatsResponse,
} from '@ila/shared';
import type { ZodType } from 'zod';
import { BACKEND_URL } from './config';
import { clearStoredToken, getStoredToken } from './auth';

/**
 * Typed client for the ILA chat API.
 *
 * Every call carries the stored Better Auth session token as a bearer header —
 * the extension never holds an AI provider key. Responses are validated against
 * the shared zod contract, so a backend/extension drift surfaces immediately
 * instead of corrupting the UI with unexpected shapes.
 */

/** Error carrying the HTTP status and machine-readable backend error code. */
export class ChatApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ChatApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** True when the session is gone and the user must sign in again. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

/**
 * Turn a non-OK response into a `ChatApiError`, preferring the backend's
 * structured envelope and falling back to a status-based message.
 */
export async function toChatApiError(response: Response): Promise<ChatApiError> {
  const retryAfterHeader = response.headers.get('retry-after');
  const retryAfterSeconds = retryAfterHeader
    ? Number.parseInt(retryAfterHeader, 10)
    : undefined;

  let code = `HTTP_${response.status}`;
  let message = defaultMessageFor(response.status);

  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (parsed.success) {
      code = parsed.data.error.code;
      message = parsed.data.error.message || message;
    }
  } catch {
    // Non-JSON body (proxy error page, empty response) — keep the fallback.
  }

  return new ChatApiError(
    response.status,
    code,
    message,
    Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
  );
}

function defaultMessageFor(status: number): string {
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403) return 'You do not have access to this conversation.';
  if (status === 404) return 'That conversation no longer exists.';
  if (status === 429) return 'You are sending messages too quickly. Please wait a moment.';
  if (status === 503) return 'The assistant is not configured on the server yet.';
  if (status >= 500) return 'The server ran into a problem. Please try again.';
  return 'Request failed. Please try again.';
}

/** Bearer headers for an authenticated API call. Throws when signed out. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken();
  if (!token) {
    throw new ChatApiError(401, 'UNAUTHENTICATED', 'You are not signed in.');
  }
  return { authorization: `Bearer ${token}` };
}

/**
 * Authenticated JSON call against the backend, validated against a shared
 * schema. Exported so every API module (chat, settings) shares one place that
 * attaches the bearer token, drops a dead session, and maps errors.
 */
export async function requestJson<T>(
  schema: ZodType<T>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = await authHeaders();

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      // Bearer auth only: never attach cookies to a cross-origin call from the
      // extension, which would widen the CSRF surface for no benefit.
      credentials: 'omit',
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ChatApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the ILA backend. Is it running?',
    );
  }

  if (response.status === 401) {
    // The token is dead; drop it so the UI falls back to the login screen.
    await clearStoredToken();
    throw await toChatApiError(response);
  }
  if (!response.ok) throw await toChatApiError(response);

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ChatApiError(
      response.status,
      'INVALID_RESPONSE',
      'The server returned an unexpected response.',
    );
  }
  return parsed.data;
}

/** Models this deployment allows. */
export async function fetchModels(): Promise<ChatModel[]> {
  const { models } = await requestJson(
    listModelsResponseSchema,
    '/api/chat/models',
  );
  return models;
}

/** One page of the signed-in user's conversations, newest first. */
export async function fetchChats(options?: {
  limit?: number;
  cursor?: string;
}): Promise<ListChatsResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  const query = params.toString();

  return requestJson(
    listChatsResponseSchema,
    `/api/chat${query ? `?${query}` : ''}`,
  );
}

/** Full message list for one conversation. 404s unless the caller owns it. */
export async function fetchChat(chatId: string): Promise<ChatDetailResponse> {
  return requestJson(
    chatDetailResponseSchema,
    `/api/chat/${encodeURIComponent(chatId)}`,
  );
}

/** Permanently delete one conversation. */
export async function deleteChat(chatId: string): Promise<void> {
  await requestJson(
    deleteChatResponseSchema,
    `/api/chat/${encodeURIComponent(chatId)}`,
    { method: 'DELETE' },
  );
}

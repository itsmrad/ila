import { DefaultChatTransport, type UIMessage } from 'ai';
import {
  CHAT_ID_HEADER,
  CHAT_LIMITS,
  type PageContext,
  type SendMessageRequest,
} from '@ila/shared';
import { BACKEND_URL } from './config';
import { authHeaders, toChatApiError } from './chat-api';

/**
 * `useChat` transport that talks to the authenticated ILA backend.
 *
 * Two deliberate choices:
 *
 * 1. Only the newest user message is uploaded. The server rebuilds the
 *    conversation from its own database, so the client cannot forge earlier
 *    assistant turns or point at a conversation it does not own.
 * 2. The conversation id is assigned by the server and read back from the
 *    `x-ila-chat-id` response header. The client never invents chat ids, which
 *    removes any chance of guessing or claiming another user's id.
 */

export interface ChatTransportContext {
  /** Current conversation id, or `undefined` to start a new one. */
  getChatId: () => string | undefined;
  /** Called with the server-assigned id for a newly created conversation. */
  onChatId: (chatId: string) => void;
  /** Model id chosen in the UI; the server still validates it. */
  getModel: () => string | undefined;
  /** Title/URL of the active tab, or `undefined` when not shared. */
  getPageContext: () => PageContext | undefined;
}

/** Collapse a UI message down to the plain text parts the API accepts. */
function toInboundMessage(
  message: UIMessage,
): SendMessageRequest['message'] | undefined {
  const parts = message.parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof part.text === 'string',
    )
    .map((part) => ({
      type: 'text' as const,
      text: part.text.slice(0, CHAT_LIMITS.maxMessageChars),
    }))
    .filter((part) => part.text.trim().length > 0)
    .slice(0, CHAT_LIMITS.maxPartsPerMessage);

  if (parts.length === 0) return undefined;
  return { id: message.id, role: 'user', parts };
}

export function createChatTransport(
  context: ChatTransportContext,
): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: `${BACKEND_URL}/api/chat`,
    // Session token is sent explicitly as a bearer header; cookies are never
    // attached from the extension origin.
    credentials: 'omit',
    headers: async () => authHeaders(),

    prepareSendMessagesRequest: ({ messages, trigger }) => {
      const chatId = context.getChatId();
      const model = context.getModel();
      const pageContext = context.getPageContext();

      if (trigger === 'regenerate-message') {
        const body: SendMessageRequest = {
          ...(chatId ? { chatId } : {}),
          retry: true,
          ...(model ? { model } : {}),
          ...(pageContext ? { pageContext } : {}),
        };
        return { body };
      }

      const last = messages.at(-1);
      const message =
        last && last.role === 'user' ? toInboundMessage(last) : undefined;

      if (!message) {
        throw new Error('Nothing to send.');
      }

      const body: SendMessageRequest = {
        ...(chatId ? { chatId } : {}),
        message,
        ...(model ? { model } : {}),
        ...(pageContext ? { pageContext } : {}),
      };
      return { body };
    },

    /**
     * Wraps `fetch` to (a) capture the server-assigned conversation id and
     * (b) replace the SDK's raw-body error with the backend's structured
     * message, which is what the UI shows the user.
     */
    fetch: async (input, init) => {
      let response: Response;
      try {
        response = await fetch(input as RequestInfo, init);
      } catch {
        throw new Error('Could not reach the ILA backend. Is it running?');
      }

      const assignedChatId = response.headers.get(CHAT_ID_HEADER);
      if (assignedChatId) context.onChatId(assignedChatId);

      if (!response.ok) {
        throw await toChatApiError(response);
      }
      return response;
    },
  });
}

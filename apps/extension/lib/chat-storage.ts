import { z } from 'zod';
import {
  AGENT_LIMITS,
  CHAT_LIMITS,
  agentPlanSchema,
  agentPlanStepSchema,
  chatRoleSchema,
  humanInputRequestSchema,
  messagePartSchema,
} from '@ila/shared';

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
const MAX_STORED_AGENT_RUNS = 40;

/** Must match `storedMessageSchema.id`. */
const MAX_STORED_ID_CHARS = 64;

const storedMessageSchema = z.object({
  id: z.string().min(1).max(MAX_STORED_ID_CHARS),
  role: chatRoleSchema,
  parts: z.array(messagePartSchema).min(1).max(CHAT_LIMITS.maxPartsPerMessage),
});

const storedAgentExecutionSchema = z.object({
  step: agentPlanStepSchema,
  status: z.enum(['running', 'succeeded', 'failed']),
  error: z.string().max(500).optional(),
});

export const storedAgentRunSchema = z.object({
  id: z.string().min(1).max(MAX_STORED_ID_CHARS),
  createdAt: z.number().int().nonnegative(),
  status: z.enum([
    'planning',
    'awaiting-confirmation',
    'awaiting-input',
    'running',
    'complete',
    'failed',
  ]),
  task: z.string().trim().min(1).max(AGENT_LIMITS.maxTaskChars),
  plan: agentPlanSchema.optional(),
  activeStep: z.number().int().min(0).max(AGENT_LIMITS.maxSteps).optional(),
  completedSteps: z.number().int().min(0).max(AGENT_LIMITS.maxSteps).optional(),
  error: z.string().max(500).optional(),
  summary: z.string().max(500).optional(),
  thinking: z.boolean().optional(),
  humanInput: humanInputRequestSchema.optional(),
  inputSubmitting: z.boolean().optional(),
  execution: z.array(storedAgentExecutionSchema).max(AGENT_LIMITS.maxExecutionRecords).optional(),
});

const storedSessionV1Schema = z.object({
  version: z.literal(1),
  chatId: z.string().uuid().optional(),
  model: z.string().max(120).optional(),
  messages: z.array(storedMessageSchema).max(MAX_STORED_MESSAGES),
  savedAt: z.number().int().nonnegative(),
});

const storedSessionSchema = z.object({
  version: z.literal(2),
  chatId: z.string().uuid().optional(),
  model: z.string().max(120).optional(),
  messages: z.array(storedMessageSchema).max(MAX_STORED_MESSAGES),
  agentRuns: z.array(storedAgentRunSchema).max(MAX_STORED_AGENT_RUNS),
  savedAt: z.number().int().nonnegative(),
});

export type StoredMessage = z.infer<typeof storedMessageSchema>;
export type StoredAgentRun = z.infer<typeof storedAgentRunSchema>;
export type StoredSession = z.infer<typeof storedSessionSchema>;

function keyFor(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/** Validate and migrate cache payloads without trusting extension storage. */
export function parseStoredSession(value: unknown): StoredSession | null {
  const parsed = storedSessionSchema.safeParse(value);
  if (parsed.success) {
    return {
      ...parsed.data,
      // A panel can be destroyed while an action is running. Never imply
      // that the restored process is still live.
      agentRuns: parsed.data.agentRuns.map((run) =>
        run.status === 'planning' ||
        run.status === 'running' ||
        run.status === 'awaiting-input' ||
        (run.status === 'awaiting-confirmation' &&
          run.plan?.steps.some((step) => step.action.type === 'upload'))
          ? {
              ...run,
              status: 'failed' as const,
              thinking: false,
              inputSubmitting: false,
              error: run.status === 'awaiting-input'
                ? 'This paused task was interrupted when the side panel closed. Start it again to continue safely.'
                : run.plan?.steps.some((step) => step.action.type === 'upload')
                ? 'The attachment was removed when the side panel closed. Attach it again and retry.'
                : 'This task was interrupted when the side panel closed.',
            }
          : run,
      ),
    };
  }

  // Version 1 contained chat messages only. Migrate it in memory so an
  // extension update never discards an existing conversation.
  const previous = storedSessionV1Schema.safeParse(value);
  if (!previous.success) return null;
  return {
    ...previous.data,
    version: 2,
    agentRuns: [],
  };
}

/** Restore the cached conversation, or `null` when absent/unreadable. */
export async function loadChatSession(
  userId: string,
): Promise<StoredSession | null> {
  const key = keyFor(userId);
  try {
    const stored = await chrome.storage.local.get(key);
    return parseStoredSession(stored[key]);
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
    agentRuns?: ReadonlyArray<StoredAgentRun>;
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
    version: 2 as const,
    ...(session.chatId ? { chatId: session.chatId } : {}),
    ...(session.model ? { model: session.model } : {}),
    messages,
    agentRuns: (session.agentRuns ?? [])
      .slice(-MAX_STORED_AGENT_RUNS)
      .flatMap((run) => {
        const parsed = storedAgentRunSchema.safeParse(run);
        return parsed.success ? [parsed.data] : [];
      }),
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

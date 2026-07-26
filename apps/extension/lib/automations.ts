import { z } from 'zod';
import { CHAT_LIMITS } from '@ila/shared';
import type { BrowserTab, ContextMode } from './tab-context';

/**
 * Automations: the catalogue shown in the side panel and the message contract
 * it uses to talk to the background service worker.
 *
 * The side panel only builds a payload and renders progress. Execution belongs
 * to the background worker, which is currently mocked — this stage validates the
 * messaging path, not the automations themselves.
 */

export const AUTOMATION_IDS = [
  'analyze-tabs',
  'github-notifications',
  'jira-tasks',
] as const;

export const automationIdSchema = z.enum(AUTOMATION_IDS);
export type AutomationId = z.infer<typeof automationIdSchema>;

export interface Automation {
  id: AutomationId;
  label: string;
  description: string;
  /** False while the automation is not implemented end-to-end. */
  available: boolean;
}

export const AUTOMATIONS: ReadonlyArray<Automation> = [
  {
    id: 'analyze-tabs',
    label: 'Analyze my tabs',
    description: 'Group the tabs you shared and suggest what to close.',
    available: true,
  },
  {
    id: 'github-notifications',
    label: 'Summarize GitHub notifications',
    description: 'Needs a connected GitHub account.',
    available: false,
  },
  {
    id: 'jira-tasks',
    label: 'Pull tasks from Jira',
    description: 'Needs a connected Jira account.',
    available: false,
  },
];

/* -------------------------------------------------------------------------- */
/* Message contract                                                            */
/* -------------------------------------------------------------------------- */

export const AUTOMATION_START = 'automation:start';
export const AUTOMATION_PROGRESS = 'automation:progress';

/** Tab metadata an automation may act on. Ids and URLs only. */
const tabRefSchema = z.object({
  id: z.number().int().nonnegative(),
  url: z.string().max(2_048),
  title: z.string().max(300),
});

export const automationStartMessageSchema = z.object({
  type: z.literal(AUTOMATION_START),
  /** Correlates progress updates with the run that produced them. */
  runId: z.string().min(1).max(64),
  automationId: automationIdSchema,
  context: z.object({
    mode: z.enum(['none', 'current', 'window', 'custom']),
    tabs: z.array(tabRefSchema).max(CHAT_LIMITS.maxContextTabs),
  }),
});

export type AutomationStartMessage = z.infer<
  typeof automationStartMessageSchema
>;

export const automationProgressMessageSchema = z.object({
  type: z.literal(AUTOMATION_PROGRESS),
  runId: z.string().min(1).max(64),
  automationId: automationIdSchema,
  status: z.enum(['running', 'complete', 'error']),
  message: z.string().max(300),
});

export type AutomationProgressMessage = z.infer<
  typeof automationProgressMessageSchema
>;

export const automationStartResponseSchema = z.object({
  accepted: z.boolean(),
  runId: z.string().min(1).max(64),
  message: z.string().max(300).optional(),
});

export type AutomationStartResponse = z.infer<
  typeof automationStartResponseSchema
>;

/* -------------------------------------------------------------------------- */
/* Side-panel helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Ask the background worker to run an automation.
 *
 * Rejections are surfaced as `accepted: false` rather than thrown: a service
 * worker that was asleep, or one that has been replaced by an extension reload,
 * makes `sendMessage` fail in ways the UI should report calmly.
 */
export async function startAutomation(input: {
  automationId: AutomationId;
  mode: ContextMode;
  tabs: ReadonlyArray<BrowserTab>;
}): Promise<AutomationStartResponse> {
  const message: AutomationStartMessage = {
    type: AUTOMATION_START,
    runId: crypto.randomUUID(),
    automationId: input.automationId,
    context: {
      mode: input.mode,
      tabs: input.tabs
        .slice(0, CHAT_LIMITS.maxContextTabs)
        .map((tab) => ({ id: tab.id, url: tab.url, title: tab.title })),
    },
  };

  try {
    const raw = await chrome.runtime.sendMessage(message);
    const parsed = automationStartResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        accepted: false,
        runId: message.runId,
        message: 'The background worker sent an unexpected reply.',
      };
    }
    return parsed.data;
  } catch {
    return {
      accepted: false,
      runId: message.runId,
      message: 'Could not reach the background worker. Try reloading ILA.',
    };
  }
}

/** Subscribe to progress updates. Returns an unsubscribe function. */
export function onAutomationProgress(
  handler: (progress: AutomationProgressMessage) => void,
): () => void {
  const listener = (raw: unknown) => {
    const parsed = automationProgressMessageSchema.safeParse(raw);
    if (parsed.success) handler(parsed.data);
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

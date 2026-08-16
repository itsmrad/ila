import {
  agentPlanResponseSchema,
  agentNextResponseSchema,
  agentAttachmentContextResponseSchema,
  type AgentAttachmentContextRequest,
  type AgentDecision,
  type AgentNextRequest,
  type AgentPlanResponse,
  type AgentPlanRequest,
} from '@ila/shared';
import { BACKEND_URL } from './config';
import { authHeaders, toChatApiError } from './chat-api';

/** Ask the authenticated backend to produce a validated, non-executing plan. */
export async function planAgentTask(
  request: AgentPlanRequest,
  signal?: AbortSignal,
): Promise<AgentPlanResponse> {
  const headers = await authHeaders();
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/agent/plan`, {
      method: 'POST',
      credentials: 'omit',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') throw cause;
    throw new Error('Could not reach the ILA agent service.');
  }

  if (!response.ok) throw await toChatApiError(response);
  const parsed = agentPlanResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('The agent service returned an invalid plan.');
  }
  return parsed.data;
}

/** Choose one action from a fresh page observation, or verify completion. */
export async function nextAgentAction(
  request: AgentNextRequest,
  signal?: AbortSignal,
): Promise<AgentDecision> {
  const headers = await authHeaders();
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/agent/next`, {
      method: 'POST',
      credentials: 'omit',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') throw cause;
    throw new Error('Could not reach the ILA browser agent.');
  }

  if (!response.ok) throw await toChatApiError(response);
  const parsed = agentNextResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('The browser agent returned an invalid decision.');
  }
  return parsed.data.decision;
}

/** Extract context from files added while a browser run is paused. */
export async function processAgentAttachments(
  request: AgentAttachmentContextRequest,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const headers = await authHeaders();
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/agent/attachment-context`, {
      method: 'POST',
      credentials: 'omit',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') throw cause;
    throw new Error('Could not process the selected attachment.');
  }

  if (!response.ok) throw await toChatApiError(response);
  const parsed = agentAttachmentContextResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The attachment service returned an invalid response.');
  return parsed.data.attachmentContext || undefined;
}

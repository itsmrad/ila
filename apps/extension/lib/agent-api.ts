import {
  agentPlanResponseSchema,
  type AgentPlan,
  type AgentPlanRequest,
} from '@ila/shared';
import { BACKEND_URL } from './config';
import { authHeaders, toChatApiError } from './chat-api';

/** Ask the authenticated backend to produce a validated, non-executing plan. */
export async function planAgentTask(
  request: AgentPlanRequest,
  signal?: AbortSignal,
): Promise<AgentPlan> {
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
  return parsed.data.plan;
}

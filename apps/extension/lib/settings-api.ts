import { z } from 'zod';
import {
  connectIntegrationResponseSchema,
  deleteLlmKeyResponseSchema,
  listIntegrationsResponseSchema,
  listLlmKeysResponseSchema,
  llmKeySummarySchema,
  llmProviderSchema,
  type ConnectIntegrationResponse,
  type IntegrationApp,
  type ListIntegrationsResponse,
  type LlmKeySummary,
  type LlmProvider,
} from '@ila/shared';
import { requestJson } from './chat-api';

/**
 * Settings API client: integrations and BYOK provider keys.
 *
 * Both are backend-owned. OAuth tokens and API keys never touch
 * `chrome.storage`; the extension holds only the non-sensitive indicator below
 * (which providers have a key) so the drawer can render before the network call
 * returns.
 */

/** Connection status for every supported app. */
export async function fetchIntegrations(): Promise<ListIntegrationsResponse> {
  return requestJson(listIntegrationsResponseSchema, '/api/integrations');
}

/**
 * Start an OAuth connection. The backend owns the flow and returns the URL the
 * user has to visit; the extension only opens it.
 */
export async function connectIntegration(
  app: IntegrationApp,
): Promise<ConnectIntegrationResponse> {
  return requestJson(
    connectIntegrationResponseSchema,
    `/api/integrations/${encodeURIComponent(app)}/connect`,
    { method: 'POST' },
  );
}

/** Providers the signed-in user has stored a key for. Never the keys. */
export async function fetchLlmKeys(): Promise<LlmKeySummary[]> {
  const { keys } = await requestJson(
    listLlmKeysResponseSchema,
    '/api/keys/llm',
  );
  return keys;
}

/**
 * Send a provider key to the backend, which encrypts it at rest.
 *
 * The caller must drop its copy immediately afterwards: the key is deliberately
 * never persisted on this side, and no endpoint can return it again.
 */
export async function saveLlmKey(
  provider: LlmProvider,
  apiKey: string,
): Promise<LlmKeySummary> {
  return requestJson(llmKeySummarySchema, '/api/keys/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, apiKey }),
  });
}

export async function deleteLlmKey(provider: LlmProvider): Promise<void> {
  await requestJson(
    deleteLlmKeyResponseSchema,
    `/api/keys/llm/${encodeURIComponent(provider)}`,
    { method: 'DELETE' },
  );
}

/* -------------------------------------------------------------------------- */
/* Local indicator                                                             */
/* -------------------------------------------------------------------------- */

const BYOK_INDICATOR_KEY = 'ila.byok.providers';

const byokIndicatorSchema = z.array(llmProviderSchema).max(20);

/**
 * Which providers had a key the last time the backend was asked.
 *
 * Provider names only — an indicator, not a credential. `chrome.storage.local`
 * is not a secure store, so nothing sensitive is written here.
 */
export async function loadByokProviders(): Promise<LlmProvider[]> {
  try {
    const stored = await chrome.storage.local.get(BYOK_INDICATOR_KEY);
    const parsed = byokIndicatorSchema.safeParse(stored[BYOK_INDICATOR_KEY]);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function saveByokProviders(
  providers: ReadonlyArray<LlmProvider>,
): Promise<void> {
  try {
    await chrome.storage.local.set({ [BYOK_INDICATOR_KEY]: [...providers] });
  } catch {
    // Indicator only; a storage failure changes nothing that matters.
  }
}

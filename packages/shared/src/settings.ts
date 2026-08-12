import { z } from "zod";

/**
 * Wire contract for user settings: third-party integrations and BYOK provider
 * keys.
 *
 * Secrets live only on the backend. Nothing in this module carries an API key
 * or an OAuth token back to a client: responses describe *whether* something is
 * configured, never the credential itself.
 */

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

/** Third-party apps the product intends to connect to. */
export const INTEGRATION_APPS = ["google", "github", "notion", "slack"] as const;

export const integrationAppSchema = z.enum(INTEGRATION_APPS);
export type IntegrationApp = z.infer<typeof integrationAppSchema>;

/** Human labels, shared so the client does not invent its own naming. */
export const INTEGRATION_APP_LABELS: Record<IntegrationApp, string> = {
  google: "Google",
  github: "GitHub",
  notion: "Notion",
  slack: "Slack",
};

export const integrationStatusSchema = z.object({
  app: integrationAppSchema,
  label: z.string(),
  connected: z.boolean(),
  /** ISO timestamp of the successful connection, or `null`. */
  connectedAt: z.string().nullable(),
});

export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const listIntegrationsResponseSchema = z.object({
  integrations: z.array(integrationStatusSchema),
  /** False when the deployment has no integration provider configured yet. */
  providerConfigured: z.boolean(),
});

export type ListIntegrationsResponse = z.infer<
  typeof listIntegrationsResponseSchema
>;

export const integrationAppParamsSchema = z.object({
  app: integrationAppSchema,
});

/** The URL the user must visit to complete the provider's OAuth flow. */
export const connectIntegrationResponseSchema = z.object({
  app: integrationAppSchema,
  redirectUrl: z.string().url(),
});

export type ConnectIntegrationResponse = z.infer<
  typeof connectIntegrationResponseSchema
>;

/* -------------------------------------------------------------------------- */
/* BYOK (bring your own key)                                                   */
/* -------------------------------------------------------------------------- */

export const LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "openrouter",
] as const;

export const llmProviderSchema = z.enum(LLM_PROVIDERS);
export type LlmProvider = z.infer<typeof llmProviderSchema>;

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  openrouter: "OpenRouter",
};

export const BYOK_LIMITS = {
  /** Shortest credential any supported provider issues. */
  minKeyChars: 20,
  maxKeyChars: 400,
} as const;

/**
 * A stored key, described without revealing it. There is deliberately no field
 * that echoes any portion of the credential.
 */
export const llmKeySummarySchema = z.object({
  provider: llmProviderSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LlmKeySummary = z.infer<typeof llmKeySummarySchema>;

export const listLlmKeysResponseSchema = z.object({
  keys: z.array(llmKeySummarySchema),
});

export type ListLlmKeysResponse = z.infer<typeof listLlmKeysResponseSchema>;

export const saveLlmKeyRequestSchema = z.object({
  provider: llmProviderSchema,
  /**
   * Printable ASCII only: every supported provider issues keys in that range,
   * and it rules out newline/control characters that could smuggle extra header
   * lines into an upstream request.
   */
  apiKey: z
    .string()
    .min(BYOK_LIMITS.minKeyChars)
    .max(BYOK_LIMITS.maxKeyChars)
    .regex(/^[\x21-\x7e]+$/, "apiKey contains unsupported characters"),
});

export type SaveLlmKeyRequest = z.infer<typeof saveLlmKeyRequestSchema>;

export const llmProviderParamsSchema = z.object({
  provider: llmProviderSchema,
});

export const deleteLlmKeyResponseSchema = z.object({
  provider: llmProviderSchema,
  deleted: z.literal(true),
});

export type DeleteLlmKeyResponse = z.infer<typeof deleteLlmKeyResponseSchema>;

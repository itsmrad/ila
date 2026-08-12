import { Router } from "express";
import {
  deleteLlmKeyResponseSchema,
  listLlmKeysResponseSchema,
  llmKeySummarySchema,
  llmProviderParamsSchema,
  saveLlmKeyRequestSchema,
} from "@ila/shared";
import { env } from "@/config/env";
import { route } from "@/lib/http";
import { SecretsUnavailableError } from "@/lib/crypto";
import { enforceRateLimit } from "@/lib/rate-limit";
import { authContext, requireAuth } from "@/middleware/require-auth";
import {
  deleteLlmKey,
  listLlmKeys,
  saveLlmKey,
} from "@/services/llm-key.service";

/**
 * BYOK provider keys. Mounted at `/api/keys`.
 *
 * The extension posts a key here over HTTPS and forgets it: the key is
 * encrypted at rest (AES-256-GCM, see `lib/crypto.ts`) and no endpoint returns
 * it, or any portion of it, afterwards. Requests are never logged with a body,
 * so the credential does not reach the log pipeline either.
 */
export const keysRouter: Router = Router();

keysRouter.use(requireAuth);

/** Modest per-user ceiling; these are cheap writes, not provider spend. */
const KEY_RATE_LIMIT = { max: 20, windowSeconds: 60 } as const;

/** A deployment without an encryption key must not accept secrets at all. */
function assertByokEnabled(): void {
  if (!env.byokEnabled) throw new SecretsUnavailableError();
}

/**
 * Providers the caller has a stored key for.
 * GET /api/keys/llm
 */
keysRouter.get(
  "/llm",
  route({
    response: listLlmKeysResponseSchema,
    handler: async ({ req }) => {
      assertByokEnabled();
      const { user } = authContext(req);
      return { keys: await listLlmKeys(user.id) };
    },
  }),
);

/**
 * Store or replace the caller's key for one provider.
 * POST /api/keys/llm
 */
keysRouter.post(
  "/llm",
  route({
    body: saveLlmKeyRequestSchema,
    response: llmKeySummarySchema,
    status: 201,
    handler: async ({ body, req }) => {
      assertByokEnabled();
      const { user } = authContext(req);
      await enforceRateLimit({
        bucket: "byok",
        subject: user.id,
        ...KEY_RATE_LIMIT,
      });
      return saveLlmKey({
        userId: user.id,
        provider: body.provider,
        apiKey: body.apiKey,
      });
    },
  }),
);

/**
 * Delete the caller's key for one provider.
 * DELETE /api/keys/llm/:provider
 */
keysRouter.delete(
  "/llm/:provider",
  route({
    params: llmProviderParamsSchema,
    response: deleteLlmKeyResponseSchema,
    handler: async ({ params, req }) => {
      assertByokEnabled();
      const { user } = authContext(req);
      await deleteLlmKey({ userId: user.id, provider: params.provider });
      return { provider: params.provider, deleted: true as const };
    },
  }),
);

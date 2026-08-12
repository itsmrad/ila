import { Router } from "express";
import {
  connectIntegrationResponseSchema,
  integrationAppParamsSchema,
  listIntegrationsResponseSchema,
} from "@ila/shared";
import { route } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { authContext, requireAuth } from "@/middleware/require-auth";
import { listIntegrationStatuses } from "@/services/integrations.service";

/**
 * Integrations API. Mounted at `/api/integrations`.
 *
 * The backend owns every OAuth flow and every stored token; the extension only
 * reads status and opens a URL the backend hands it. No credential is ever part
 * of a response here.
 */
export const integrationsRouter: Router = Router();

integrationsRouter.use(requireAuth);

/**
 * Connection status for every supported app.
 * GET /api/integrations
 */
integrationsRouter.get(
  "/",
  route({
    response: listIntegrationsResponseSchema,
    handler: async ({ req }) => {
      const { user } = authContext(req);
      return {
        integrations: await listIntegrationStatuses(user.id),
        // No integration provider is wired up yet, so the UI can explain why
        // "Connect" is unavailable instead of failing on click.
        providerConfigured: false,
      };
    },
  }),
);

/**
 * Begin an OAuth connection and return the URL the user must visit.
 *
 * Not implemented yet: the provider (Composio) is wired up in a later stage.
 * The route exists so the client contract is fixed now, and it answers with a
 * typed 501 rather than a mocked URL that would fail confusingly in the browser.
 *
 * POST /api/integrations/:app/connect
 */
integrationsRouter.post(
  "/:app/connect",
  route({
    params: integrationAppParamsSchema,
    response: connectIntegrationResponseSchema,
    handler: ({ params }) => {
      throw new AppError(
        501,
        "INTEGRATION_NOT_AVAILABLE",
        `Connecting ${params.app} is not available yet.`,
        { expose: true },
      );
    },
  }),
);

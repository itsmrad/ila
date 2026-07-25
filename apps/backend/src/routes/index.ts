import { Router } from "express";
import { z } from "zod";
import { route } from "@/lib/http";
import { healthRouter } from "@/routes/health.route";
import { sessionRouter } from "@/routes/session.route";

/**
 * Placeholder router for planned domains. Returns a typed 501 so the API
 * surface is discoverable while implementation is pending.
 */
function plannedRouter(feature: string): Router {
  const r: Router = Router();
  r.all(
    /.*/,
    route({
      status: 501,
      response: z.object({
        code: z.literal("NOT_IMPLEMENTED"),
        feature: z.string(),
        message: z.string(),
      }),
      handler: () => ({
        code: "NOT_IMPLEMENTED" as const,
        feature,
        message: `The '${feature}' API is planned but not yet implemented.`,
      }),
    }),
  );
  return r;
}

/**
 * Root API router. Mounted at `/api`.
 *
 * Note: `/api/auth/*` is handled directly by the Better Auth node handler in
 * `app.ts` (it must run before the JSON body parser), so it is intentionally
 * not registered here.
 */
export const apiRouter: Router = Router();

// Operational
apiRouter.use("/health", healthRouter);
apiRouter.use("/session", sessionRouter);

// Planned product surfaces (extension automation, memory, user management).
apiRouter.use("/users", plannedRouter("users"));
apiRouter.use("/workflows", plannedRouter("workflows"));
apiRouter.use("/memory", plannedRouter("memory"));

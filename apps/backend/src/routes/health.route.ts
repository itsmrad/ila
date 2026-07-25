import { Router } from "express";
import { z } from "zod";
import { route } from "@/lib/http";
import { getHealthReport } from "@/services/health.service";

const componentSchema = z.object({
  status: z.enum(["up", "down", "degraded"]),
  latencyMs: z.number().optional(),
  error: z.string().optional(),
  detail: z.string().optional(),
});

const healthReportSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  version: z.string(),
  environment: z.string(),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
  components: z.record(z.string(), componentSchema),
});

const livenessSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string(),
});

export const healthRouter: Router = Router();

/**
 * Liveness probe — process is running. Cheap, never touches dependencies.
 * GET /api/health/live
 */
healthRouter.get(
  "/live",
  route({
    response: livenessSchema,
    handler: () => ({ status: "ok" as const, timestamp: new Date().toISOString() }),
  }),
);

/**
 * Readiness probe — process AND critical dependencies are usable.
 * Returns 503 when not ready so orchestrators can gate traffic.
 * GET /api/health/ready
 */
healthRouter.get(
  "/ready",
  route({
    response: healthReportSchema,
    handler: async ({ res }) => {
      const report = await getHealthReport();
      if (report.status !== "healthy") res.status(503);
      return report;
    },
  }),
);

/**
 * Full health report — server, database, and (future) service statuses.
 * GET /api/health
 */
healthRouter.get(
  "/",
  route({
    response: healthReportSchema,
    handler: async ({ res }) => {
      const report = await getHealthReport();
      if (report.status === "unhealthy") res.status(503);
      return report;
    },
  }),
);

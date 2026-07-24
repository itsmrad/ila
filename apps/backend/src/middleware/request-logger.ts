import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Per-request structured logging with correlation IDs.
 *
 * Reuses an incoming `x-request-id` header when present so logs can be traced
 * across services; otherwise a UUID is generated and echoed back in the
 * response headers.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers["x-request-id"];
    const candidate = Array.isArray(existing) ? existing[0] : existing;
    const id =
      typeof candidate === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidate)
        ? candidate
        : randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: {
    ignore: (req) => req.url === "/api/health/live",
  },
});

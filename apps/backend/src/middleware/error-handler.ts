import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, NotFoundError } from "@/lib/errors";
import { isProduction } from "@/config/env";

/** Shape returned for every error response. */
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/** 404 handler for unmatched routes. Must be registered after all routes. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Cannot ${req.method} ${req.path}`));
};

/** Errors from Express middleware (body-parser, etc.) carry an HTTP status. */
interface HttpishError extends Error {
  status?: unknown;
  statusCode?: unknown;
  type?: unknown;
}

/**
 * Extract a client-error status from a third-party middleware error.
 * Only 4xx is honoured — a library reporting 5xx is still an internal failure.
 */
function clientErrorStatus(err: unknown): number | undefined {
  if (!(err instanceof Error)) return undefined;
  const candidate = (err as HttpishError).status ?? (err as HttpishError).statusCode;
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) return undefined;
  return candidate >= 400 && candidate < 500 ? candidate : undefined;
}

function clientErrorBody(status: number, err: unknown): ErrorBody["error"] {
  const type = err instanceof Error ? (err as HttpishError).type : undefined;

  if (status === 413) {
    return { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." };
  }
  if (typeof type === "string" && type.startsWith("entity.")) {
    return { code: "BAD_REQUEST", message: "Request body could not be parsed." };
  }
  return { code: "BAD_REQUEST", message: "Bad request." };
}

/**
 * Central error handler. Normalises `AppError`, `ZodError`, and unknown errors
 * into a single JSON envelope and logs unexpected failures with their stack.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = (req.id as string | undefined) ?? undefined;

  // Log: 5xx and unknown errors at error level with stack; client errors at warn.
  const log = req.log ?? console;

  let statusCode = 500;
  let body: ErrorBody;

  const middlewareStatus = clientErrorStatus(err);

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    body = {
      error: {
        code: err.code,
        message: err.expose ? err.message : "Internal server error",
        details: err.expose ? err.details : undefined,
        requestId,
      },
    };
    // Give throttled clients a concrete back-off instead of a bare 429.
    if (statusCode === 429) {
      const retryAfter = (err.details as { retryAfterSeconds?: number } | undefined)
        ?.retryAfterSeconds;
      if (typeof retryAfter === "number" && Number.isFinite(retryAfter)) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryAfter))));
      }
    }
    if (statusCode >= 500) log.error({ err }, err.message);
  } else if (err instanceof ZodError) {
    statusCode = 422;
    body = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: err.flatten(),
        requestId,
      },
    };
  } else if (middlewareStatus !== undefined) {
    // e.g. body-parser's 413 (payload too large) or 400 (malformed JSON).
    // Without this branch these surface as misleading 500s.
    statusCode = middlewareStatus;
    body = { error: { ...clientErrorBody(middlewareStatus, err), requestId } };
    log.warn({ err, statusCode }, "Rejected request");
  } else {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error({ err: error }, "Unhandled error");
    body = {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        details: isProduction ? undefined : { stack: error.stack },
        requestId,
      },
    };
  }

  res.status(statusCode).json(body);
};

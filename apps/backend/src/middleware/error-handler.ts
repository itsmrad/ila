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

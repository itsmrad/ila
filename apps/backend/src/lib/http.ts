import type { Request, RequestHandler, Response } from "express";
import { type ZodTypeAny, z } from "zod";
import { ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

type Infer<T> = T extends ZodTypeAny ? z.infer<T> : undefined;

interface RouteConfig<
  TParams extends ZodTypeAny | undefined,
  TQuery extends ZodTypeAny | undefined,
  TBody extends ZodTypeAny | undefined,
  TResponse extends ZodTypeAny,
> {
  /** Validates `req.params`. */
  params?: TParams;
  /** Validates `req.query`. */
  query?: TQuery;
  /** Validates `req.body`. */
  body?: TBody;
  /** Validates the value returned by the handler before it is serialised. */
  response: TResponse;
  /** HTTP status on success (default 200). */
  status?: number;
  handler: (input: {
    params: Infer<TParams>;
    query: Infer<TQuery>;
    body: Infer<TBody>;
    req: Request;
    res: Response;
  }) => Promise<z.infer<TResponse>> | z.infer<TResponse>;
}

function validateInput<T extends ZodTypeAny>(
  schema: T,
  value: unknown,
  source: "params" | "query" | "body",
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(`Invalid request ${source}`, {
      [source]: result.error.flatten(),
    });
  }
  return result.data;
}

/**
 * Build a fully type-safe Express handler.
 *
 * - Request `params`/`query`/`body` are validated against the supplied schemas
 *   (invalid input → 422 with structured details).
 * - The handler's return value is validated against `response`; a mismatch is a
 *   server bug and surfaces as a 500 rather than leaking a malformed payload.
 */
export function route<
  TResponse extends ZodTypeAny,
  TParams extends ZodTypeAny | undefined = undefined,
  TQuery extends ZodTypeAny | undefined = undefined,
  TBody extends ZodTypeAny | undefined = undefined,
>(config: RouteConfig<TParams, TQuery, TBody, TResponse>): RequestHandler {
  return async (req, res, next) => {
    try {
      const params = (
        config.params ? validateInput(config.params, req.params, "params") : undefined
      ) as Infer<TParams>;
      const query = (
        config.query ? validateInput(config.query, req.query, "query") : undefined
      ) as Infer<TQuery>;
      const body = (
        config.body ? validateInput(config.body, req.body, "body") : undefined
      ) as Infer<TBody>;

      const result = await config.handler({ params, query, body, req, res });

      if (res.headersSent) return;

      const parsed = config.response.safeParse(result);
      if (!parsed.success) {
        logger.error(
          { path: req.originalUrl, issues: parsed.error.flatten() },
          "Response validation failed",
        );
        throw new Error("Response validation failed");
      }

      res.status(config.status ?? 200).json(parsed.data);
    } catch (error) {
      next(error);
    }
  };
}

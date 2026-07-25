import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { CHAT_ID_HEADER } from "@ila/shared";
import { auth } from "@/lib/auth";
import { env } from "@/config/env";
import { requestLogger } from "@/middleware/request-logger";
import { errorHandler, notFoundHandler } from "@/middleware/error-handler";
import { apiRouter } from "@/routes";
import { authPagesRouter } from "@/routes/auth-pages.route";

/**
 * Origins allowed to make credentialed (cookie-bearing) requests.
 * Combines configured trusted origins with the backend + web app URLs.
 */
const allowedOrigins = new Set(
  [
    ...env.TRUSTED_ORIGINS,
    env.WEB_APP_URL,
    env.BETTER_AUTH_URL,
    env.EXTENSION_ORIGIN,
  ].filter((value): value is string => Boolean(value)),
);

export function createApp(): Express {
  const app = express();

  // Trust only configured reverse proxies; a hop count can be spoofed when a
  // request reaches this process directly.
  app.set(
    "trust proxy",
    env.TRUSTED_PROXY_CIDRS.length ? env.TRUSTED_PROXY_CIDRS : false,
  );
  app.disable("x-powered-by");

  app.use(requestLogger);

  app.use(
    helmet({
      // The login page ships an inline script; it sets its own CSP per-route.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin / server-to-server (no Origin header) and any
        // explicitly trusted origin.
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        // Do not throw here: rejected preflights should not become 500s (or
        // expose a development stack trace). The request proceeds without any
        // CORS permission, so browsers block cross-origin access.
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      // The streaming chat endpoint returns the server-assigned conversation id
      // in a header; it must be readable by the extension's fetch client.
      exposedHeaders: [
        CHAT_ID_HEADER,
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "retry-after",
      ],
    }),
  );

  // Better Auth must be mounted BEFORE the JSON body parser, otherwise the
  // client API hangs. Express 4 wildcard syntax.
  app.all("/api/auth/*", toNodeHandler(auth));

  // The largest valid chat request is ~64 KB (see CHAT_LIMITS); parse it with a
  // tighter budget than the generic API so an oversized payload is rejected
  // before it is fully buffered. Registered first — body-parser marks the
  // request as parsed, so the generic parser below skips it.
  app.use("/api/chat", express.json({ limit: "128kb" }));

  // JSON parsing for everything else.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Server-rendered auth pages (login test page) at the root.
  app.use("/", authPagesRouter);

  // Versioned/namespaced JSON API.
  app.use("/api", apiRouter);

  // 404 + centralised error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
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
    }),
  );

  // Better Auth must be mounted BEFORE the JSON body parser, otherwise the
  // client API hangs. Express 4 wildcard syntax.
  app.all("/api/auth/*", toNodeHandler(auth));

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

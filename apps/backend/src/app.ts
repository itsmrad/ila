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
    env.EXTENSION_REDIRECT_URL,
  ].filter((value): value is string => Boolean(value)),
);

export function createApp(): Express {
  const app = express();

  // Behind a proxy/load balancer in production — trust X-Forwarded-* headers
  // so req.ip and secure-cookie detection work correctly.
  app.set("trust proxy", 1);
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
        // explicitly trusted origin. Chrome extensions send an Origin too.
        if (!origin || allowedOrigins.has(origin) || origin.startsWith("chrome-extension://")) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin not allowed by CORS: ${origin}`));
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

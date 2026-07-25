import type { Server } from "node:http";
import { createApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { closeDatabase } from "@/db";

const app = createApp();

const server: Server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      url: env.BETTER_AUTH_URL,
      googleOAuth: env.googleOAuthEnabled,
    },
    `ILA backend listening on port ${env.PORT}`,
  );
});

/** Graceful shutdown: stop accepting connections, then drain the DB pool. */
let shutdownPromise: Promise<void> | undefined;

function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = new Promise<void>((resolve) => {
    logger.info({ signal }, "Shutting down…");

    const forceExit = setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async (err) => {
      if (err) {
        logger.error({ err }, "Error during server close");
        process.exit(1);
      }
      try {
        await closeDatabase();
        logger.info("Shutdown complete");
        resolve();
        process.exit(0);
      } catch (dbErr) {
        logger.error({ err: dbErr }, "Error closing database");
        process.exit(1);
      }
    });
  });

  return shutdownPromise;
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    await shutdown(signal);
  });
}

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — exiting");
  process.exit(1);
});

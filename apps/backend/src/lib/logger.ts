import { pino } from "pino";
import { env, isProduction } from "@/config/env";

/**
 * Application logger.
 *
 * - Production: structured JSON on stdout (ready for log shippers).
 * - Development: pretty-printed, colourised output via `pino-pretty`.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "ila-backend" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.token",
      "*.secret",
    ],
    censor: "[redacted]",
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname,service",
        },
      },
});

export type Logger = typeof logger;

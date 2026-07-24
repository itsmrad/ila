import "dotenv/config";
import { z } from "zod";

/**
 * Central, fail-fast environment configuration.
 *
 * Every process that needs configuration imports `env` from here. If a required
 * variable is missing or malformed the process exits immediately with a clear
 * report instead of failing later at an arbitrary call site.
 */

const csv = () =>
  z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
    );

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3005),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    // Better Auth
    BETTER_AUTH_URL: z.string().url(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),

    // Database
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection URL"),

    // Google OAuth (optional — provider is only registered when both are set)
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // Origins / redirects
    TRUSTED_ORIGINS: csv(),
    EXTENSION_REDIRECT_URL: z.string().url().optional(),
    WEB_APP_URL: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.NODE_ENV === "production" &&
      value.BETTER_AUTH_URL.startsWith("http://")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BETTER_AUTH_URL"],
        message: "BETTER_AUTH_URL must use https in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema> & {
  /** True when Google OAuth is fully configured. */
  googleOAuthEnabled: boolean;
};

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    // Use console here: the logger itself depends on validated env.
    console.error(`\n❌ Invalid environment configuration:\n${issues}\n`);
    process.exit(1);
  }

  return {
    ...parsed.data,
    googleOAuthEnabled: Boolean(
      parsed.data.GOOGLE_CLIENT_ID && parsed.data.GOOGLE_CLIENT_SECRET,
    ),
  };
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

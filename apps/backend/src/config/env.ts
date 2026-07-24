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

const httpUrl = (name: string) =>
  z
    .string()
    .url(`${name} must be a valid URL`)
    .refine(
      (value) => {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      },
      `${name} must use http or https`,
    );

const postgresUrl = z
  .string()
  .url("DATABASE_URL must be a valid connection URL")
  .refine(
    (value) => {
      const protocol = new URL(value).protocol;
      return protocol === "postgres:" || protocol === "postgresql:";
    },
    "DATABASE_URL must use postgres or postgresql",
  );

const extensionOrigin = z
  .string()
  .url("EXTENSION_ORIGIN must be a valid URL")
  .refine(
    (value) => {
      const url = new URL(value);
      return (
        url.protocol === "chrome-extension:" &&
        /^[a-p]{32}$/.test(url.hostname) &&
        (url.pathname === "" || url.pathname === "/")
      );
    },
    "EXTENSION_ORIGIN must be a Chrome extension origin",
  );

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    // Better Auth
    BETTER_AUTH_URL: httpUrl("BETTER_AUTH_URL"),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),

    // Database
    DATABASE_URL: postgresUrl,

    // Google OAuth (optional — provider is only registered when both are set)
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // Origins / redirects
    TRUSTED_ORIGINS: csv(),
    /** Exact `chrome-extension://<id>` origin permitted to call the API. */
    EXTENSION_ORIGIN: extensionOrigin.optional(),
    /** Exact Chrome identity callback or web callback used for token hand-off. */
    EXTENSION_REDIRECT_URL: httpUrl("EXTENSION_REDIRECT_URL").optional(),
    WEB_APP_URL: httpUrl("WEB_APP_URL").optional(),
    /** CIDRs of reverse proxies that are allowed to provide X-Forwarded-For. */
    TRUSTED_PROXY_CIDRS: csv(),
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

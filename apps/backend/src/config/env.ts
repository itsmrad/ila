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

    // ---------------------------------------------------------------------
    // AI provider (any OpenAI-compatible endpoint: OpenRouter, OpenAI, vLLM…)
    // ---------------------------------------------------------------------
    /** Base URL of the OpenAI-compatible API (must include the version path). */
    AI_BASE_URL: httpUrl("AI_BASE_URL").default("https://openrouter.ai/api/v1"),
    /** Secret API key. Never leaves the backend. Chat is disabled when unset. */
    AI_API_KEY: z.string().min(1).optional(),
    /** Provider label used in AI SDK model ids and logs. */
    AI_PROVIDER_NAME: z.string().min(1).max(40).default("openrouter"),
    /** Default model id used when the client does not request one. */
    AI_MODEL: z.string().min(1).max(120).default("moonshotai/kimi-k3"),
    /**
     * Allowlist of model ids a client may request. Defaults to `AI_MODEL` only.
     * A client-supplied model is never forwarded unless it appears here.
     */
    AI_ALLOWED_MODELS: csv(),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(32_000).default(2_048),
    AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
    /** Upstream request timeout. Guards against a hung provider connection. */
    AI_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(600_000)
      .default(120_000),
    /** Total deadline for one agent plan/decision, kept below interactive UX limits. */
    AI_AGENT_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(60_000)
      .default(28_000),
    /** Per-model deadline before the planner tries another allowed model. */
    AI_AGENT_ATTEMPT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(2_000)
      .max(30_000)
      .default(8_000),
    /** Optional dedicated low-latency model for browser planning and control. */
    AI_AGENT_MODEL: z.string().min(1).max(120).optional(),
    /** Optional preferred failover model; it must also be in the allowlist. */
    AI_AGENT_FALLBACK_MODEL: z.string().min(1).max(120).optional(),

    // Per-user rate limit for the (expensive) chat completion endpoint.
    CHAT_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3_600)
      .default(60),
    CHAT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(20),
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

    if (
      value.NODE_ENV === "production" &&
      value.AI_API_KEY &&
      value.AI_BASE_URL.startsWith("http://")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_BASE_URL"],
        message:
          "AI_BASE_URL must use https in production (the API key is sent as a bearer header)",
      });
    }

    if (
      value.AI_ALLOWED_MODELS.length > 0 &&
      !value.AI_ALLOWED_MODELS.includes(value.AI_MODEL)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_ALLOWED_MODELS"],
        message: "AI_ALLOWED_MODELS must include AI_MODEL",
      });
    }

    for (const [path, model] of [
      ["AI_AGENT_MODEL", value.AI_AGENT_MODEL],
      ["AI_AGENT_FALLBACK_MODEL", value.AI_AGENT_FALLBACK_MODEL],
    ] as const) {
      const modelAllowed = value.AI_ALLOWED_MODELS.length > 0
        ? Boolean(model && value.AI_ALLOWED_MODELS.includes(model))
        : model === value.AI_MODEL;
      if (model && !modelAllowed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${path} must appear in AI_ALLOWED_MODELS`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema> & {
  /** True when Google OAuth is fully configured. */
  googleOAuthEnabled: boolean;
  /** True when an AI API key is configured; chat returns 503 when false. */
  aiEnabled: boolean;
  /** Resolved model allowlist (always contains `AI_MODEL`). */
  aiAllowedModels: readonly string[];
};

function loadEnv(): Env {
  // Treat an empty value as "unset" so a commented-out/blank line in `.env`
  // falls back to the schema default instead of failing validation.
  const source = Object.fromEntries(
    Object.entries(process.env).filter(
      ([, value]) => value !== undefined && value.trim() !== "",
    ),
  );

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    // Use console here: the logger itself depends on validated env.
    console.error(`\n❌ Invalid environment configuration:\n${issues}\n`);
    process.exit(1);
  }

  const allowedModels =
    parsed.data.AI_ALLOWED_MODELS.length > 0
      ? parsed.data.AI_ALLOWED_MODELS
      : [parsed.data.AI_MODEL];

  return {
    ...parsed.data,
    googleOAuthEnabled: Boolean(
      parsed.data.GOOGLE_CLIENT_ID && parsed.data.GOOGLE_CLIENT_SECRET,
    ),
    aiEnabled: Boolean(parsed.data.AI_API_KEY),
    aiAllowedModels: Object.freeze(allowedModels),
  };
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

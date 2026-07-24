import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, openAPI, username } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env, isProduction } from "@/config/env";
import { logger } from "@/lib/logger";

/**
 * Trusted origins for CSRF / redirect validation.
 * The `BETTER_AUTH_URL` origin is trusted automatically by Better Auth.
 */
const trustedOrigins = Array.from(
  new Set(
    [
      ...env.TRUSTED_ORIGINS,
      env.WEB_APP_URL,
      // Chrome identity redirect surface for extensions.
      "chrome-extension://*",
    ].filter((value): value is string => Boolean(value)),
  ),
);

export const auth = betterAuth({
  appName: "ILA",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  trustedOrigins,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
    autoSignIn: true,
    // TODO(email): wire a real provider (Resend/SES) before enabling verification.
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Placeholder until an email provider is configured.
      logger.info({ email: user.email, url }, "Password reset requested");
    },
  },

  emailVerification: {
    sendOnSignUp: false,
    sendVerificationEmail: async ({ user, url }) => {
      logger.info({ email: user.email, url }, "Email verification requested");
    },
  },

  socialProviders: env.googleOAuthEnabled
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : undefined,

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
    encryptOAuthTokens: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  rateLimit: {
    enabled: true,
    // Persist counters so limits survive restarts / multiple instances.
    storage: "database",
    window: 10,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },

  advanced: {
    useSecureCookies: isProduction,
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
    defaultCookieAttributes: {
      sameSite: "lax",
    },
  },

  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 32,
    }),
    // Cookieless auth for the browser extension: sign-in responses expose a
    // `set-auth-token` header and requests authenticate via `Authorization:
    // Bearer <token>`. Required because SameSite cookies are not sent from a
    // chrome-extension:// origin on cross-site requests.
    bearer(),
    openAPI(),
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;

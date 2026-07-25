import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";

/**
 * Authenticated principal attached to a request by {@link requireAuth}.
 * Derived from Better Auth's inferred session type, so it stays in sync with
 * the auth configuration (plugins, additional fields) automatically.
 */
export type AuthContext = {
  user: (typeof auth.$Infer.Session)["user"];
  session: (typeof auth.$Infer.Session)["session"];
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Present only on routes behind `requireAuth`. */
      auth?: AuthContext;
    }
  }
}

/**
 * Gate for every non-public API route.
 *
 * Accepts either the browser cookie session (web app) or an
 * `Authorization: Bearer <token>` session token (browser extension — the
 * `bearer()` plugin is enabled in `lib/auth.ts`). Verification is always
 * server-side against the session store; nothing about the caller's identity is
 * taken from the request body.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const result = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!result?.user?.id) {
      throw new UnauthorizedError("Authentication required");
    }

    req.auth = { user: result.user, session: result.session };
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Narrow `req.auth` for handlers mounted behind {@link requireAuth}.
 * Throws rather than returning `undefined` so a mis-wired route fails loudly
 * instead of silently serving unauthenticated traffic.
 */
export function authContext(req: {
  auth?: AuthContext;
}): AuthContext {
  if (!req.auth) {
    throw new UnauthorizedError("Authentication required");
  }
  return req.auth;
}

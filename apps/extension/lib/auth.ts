import { z } from "zod";
import { BACKEND_URL } from "./config";

/** chrome.storage.local key holding the Better Auth session token. */
const TOKEN_KEY = "ila.session.token";

/**
 * Shape of the authenticated user as returned by `GET /api/session/me`.
 * Validated at runtime: the response drives the storage key for the local chat
 * cache, so it must never be trusted on the strength of a TypeScript cast.
 */
const sessionUserSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(300),
  email: z.string().max(320),
  emailVerified: z.boolean(),
  image: z.string().max(2_048).nullish(),
  username: z.string().max(64).nullish(),
  displayUsername: z.string().max(64).nullish(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

export async function getStoredToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  const token = result[TOKEN_KEY];
  return typeof token === "string" && token.length > 0 ? token : null;
}

async function setStoredToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearStoredToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}

/**
 * Fetch the current session/user from the backend using the bearer token.
 * Returns `null` for any non-OK or unexpected response (expired/invalid token,
 * network error, contract drift).
 */
export async function fetchSession(token: string): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/session/me`, {
      credentials: "omit",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const parsed = sessionUserSchema.safeParse(
      (body as { user?: unknown } | null)?.user,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Drive the full login flow:
 *   1. Open the backend login page inside `chrome.identity.launchWebAuthFlow`.
 *   2. The user signs in (email/username or Google) on the backend.
 *   3. The backend bridge redirects to `<extension>.chromiumapp.org/#token=…`.
 *   4. We extract the token, persist it, and return it.
 */
export async function launchLogin(): Promise<string> {
  const redirectUri = chrome.identity.getRedirectURL();
  const url = `${BACKEND_URL}/login?redirect=${encodeURIComponent(redirectUri)}`;

  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url,
    interactive: true,
  });

  if (!resultUrl) throw new Error("Sign-in was cancelled.");

  const fragment = new URL(resultUrl).hash.replace(/^#/, "");
  const token = new URLSearchParams(fragment).get("token");
  if (!token) throw new Error("Sign-in did not return a session token.");

  await setStoredToken(token);
  return token;
}

/** Revoke the session on the backend, then clear the locally stored token. */
export async function signOut(token: string): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/api/auth/sign-out`, {
    method: "POST",
    credentials: "omit",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Sign-out request failed.");
  }
  await clearStoredToken();
}

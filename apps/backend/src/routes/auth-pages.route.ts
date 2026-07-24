import { Router } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { renderLoginPage } from "@/views/login-page";
import { renderBridgePage } from "@/views/bridge-page";
import { auth } from "@/lib/auth";
import { env } from "@/config/env";

/**
 * Server-rendered auth test pages.
 *
 * Flow: the extension opens `/login` → user authenticates (email/username or
 * Google) → `/auth/bridge` hands the session token back to the extension's
 * callback URL. This is a stand-in for the real web frontend and is used for
 * local testing and by the browser extension's login flow.
 */
export const authPagesRouter: Router = Router();

/**
 * Only allow redirecting the session token to trusted destinations. This
 * prevents an open-redirect that would leak the session token to an arbitrary
 * origin. Chrome extensions use `https://<id>.chromiumapp.org/` (via
 * `chrome.identity.launchWebAuthFlow`) or a `chrome-extension://` URL.
 */
function isAllowedRedirect(target: string): boolean {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }

  // Chrome extension auth-flow surfaces.
  if (url.protocol === "chrome-extension:") return true;
  if (url.protocol === "https:" && url.hostname.endsWith(".chromiumapp.org")) {
    return true;
  }

  // Explicitly configured web/extension callback origins.
  const allowedOrigins = [env.EXTENSION_REDIRECT_URL, env.WEB_APP_URL]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return undefined;
      }
    })
    .filter((value): value is string => Boolean(value));

  return allowedOrigins.includes(url.origin);
}

function resolveRedirect(raw: unknown): string {
  const candidate =
    typeof raw === "string" && raw.length > 0
      ? raw
      : (env.EXTENSION_REDIRECT_URL ?? env.WEB_APP_URL ?? "/");
  return candidate;
}

authPagesRouter.get("/login", (req, res) => {
  const redirectUrl = resolveRedirect(req.query.redirect);

  const html = renderLoginPage({
    authBasePath: "/api/auth",
    googleEnabled: env.googleOAuthEnabled,
    redirectUrl,
  });

  res
    .status(200)
    .type("html")
    // This page ships its own inline script/style; relax CSP just for it.
    .setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    );
  res.send(html);
});

/**
 * Token hand-off. Reached after a successful login with a valid session cookie
 * on this origin. Reads the session server-side and bounces the token to the
 * (validated) extension redirect URL via the URL fragment.
 * GET /auth/bridge?redirect=<extension-callback-url>
 */
authPagesRouter.get("/auth/bridge", async (req, res) => {
  const redirectUrl = resolveRedirect(req.query.redirect);

  const sendHtml = (html: string) =>
    res
      .status(200)
      .type("html")
      .setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      )
      .send(html);

  if (!isAllowedRedirect(redirectUrl)) {
    sendHtml(
      renderBridgePage({
        kind: "error",
        message: "This sign-in redirect is not allowed.",
      }),
    );
    return;
  }

  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    sendHtml(
      renderBridgePage({
        kind: "error",
        message: "No active session. Please try signing in again.",
      }),
    );
    return;
  }

  sendHtml(
    renderBridgePage({
      kind: "success",
      redirectUrl,
      token: session.session.token,
    }),
  );
});

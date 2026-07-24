interface BridgeSuccessConfig {
  kind: "success";
  /** Absolute redirect target (extension callback, e.g. chromiumapp.org). */
  redirectUrl: string;
  /** Session token handed to the extension via the URL fragment. */
  token: string;
}

interface BridgeErrorConfig {
  kind: "error";
  message: string;
}

export type BridgePageConfig = BridgeSuccessConfig | BridgeErrorConfig;

/**
 * Token hand-off page.
 *
 * After a successful login (email/password or Google) the browser lands here
 * with a valid session cookie on the backend origin. We read the session
 * server-side, then bounce to the extension's redirect URL with the session
 * token in the URL fragment. `chrome.identity.launchWebAuthFlow` intercepts
 * that redirect and returns the token to the extension.
 *
 * The token is placed in the fragment (`#token=`) rather than the query string
 * so it is never sent to any server or written to server logs.
 */
export function renderBridgePage(config: BridgePageConfig): string {
  const payload =
    config.kind === "success"
      ? { ok: true, redirectUrl: config.redirectUrl, token: config.token }
      : { ok: false, message: config.message };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Signing you in · ILA</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0b0d12; color:#e7e9ee; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; padding:24px; }
  .box { text-align:center; max-width:360px; }
  .spinner { width:28px; height:28px; margin:0 auto 16px; border:3px solid #252b37; border-top-color:#6d5efc; border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .err { color:#ff6b6b; }
</style>
</head>
<body>
  <div class="box">
    <div class="spinner" id="spinner"></div>
    <div id="msg">Completing sign-in…</div>
  </div>
<script>
  const R = ${serializeForInlineScript(payload)};
  const msg = document.getElementById("msg");
  const spinner = document.getElementById("spinner");
  if (R.ok) {
    const target = R.redirectUrl + "#token=" + encodeURIComponent(R.token);
    msg.textContent = "Redirecting back to ILA…";
    window.location.replace(target);
  } else {
    spinner.style.display = "none";
    msg.className = "err";
    msg.textContent = R.message || "Sign-in could not be completed.";
  }
</script>
</body>
</html>`;
}
import { serializeForInlineScript } from "@/views/script-data";

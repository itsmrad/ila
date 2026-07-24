interface LoginPageConfig {
  /** Better Auth base path, e.g. "/api/auth". */
  authBasePath: string;
  /** Whether the Google button should be rendered. */
  googleEnabled: boolean;
  /** Where to send the user after a successful login (extension callback). */
  redirectUrl: string;
}

/**
 * Self-contained HTML test login page.
 *
 * Talks directly to the Better Auth REST endpoints with `credentials: include`
 * so the session cookie is set on this backend's origin, then redirects back to
 * the extension callback URL. Replaced by the real web app frontend later.
 */
export function renderLoginPage(config: LoginPageConfig): string {
  const cfg = {
    authBasePath: config.authBasePath,
    googleEnabled: config.googleEnabled,
    redirectUrl: config.redirectUrl,
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Sign in · ILA</title>
<style>
  :root { color-scheme: light dark; --bg:#0b0d12; --card:#151922; --fg:#e7e9ee; --muted:#98a2b3; --accent:#6d5efc; --border:#252b37; --danger:#ff6b6b; --ok:#37d67a; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; padding:24px; }
  .card { width:100%; max-width:400px; background:var(--card); border:1px solid var(--border); border-radius:16px; padding:28px; box-shadow:0 12px 40px rgba(0,0,0,.35); }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:20px; }
  .brand .dot { width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg,var(--accent),#9b8bff); }
  .brand h1 { font-size:18px; margin:0; letter-spacing:.2px; }
  .tabs { display:flex; gap:6px; background:#0e121a; border:1px solid var(--border); border-radius:10px; padding:4px; margin-bottom:18px; }
  .tabs button { flex:1; padding:8px; border:0; background:transparent; color:var(--muted); border-radius:7px; cursor:pointer; font-weight:600; }
  .tabs button.active { background:var(--card); color:var(--fg); box-shadow:0 1px 0 rgba(255,255,255,.04); }
  label { display:block; font-size:12px; color:var(--muted); margin:12px 0 6px; }
  input { width:100%; padding:11px 12px; background:#0e121a; border:1px solid var(--border); border-radius:9px; color:var(--fg); font-size:14px; }
  input:focus { outline:none; border-color:var(--accent); }
  button.primary { width:100%; margin-top:18px; padding:12px; border:0; border-radius:10px; background:var(--accent); color:#fff; font-weight:700; cursor:pointer; }
  button.primary:disabled { opacity:.6; cursor:not-allowed; }
  .divider { display:flex; align-items:center; gap:12px; color:var(--muted); font-size:12px; margin:18px 0; }
  .divider::before, .divider::after { content:""; flex:1; height:1px; background:var(--border); }
  button.google { width:100%; padding:11px; border:1px solid var(--border); border-radius:10px; background:#fff; color:#1f2328; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; }
  .msg { margin-top:14px; font-size:13px; min-height:18px; }
  .msg.error { color:var(--danger); }
  .msg.ok { color:var(--ok); }
  .hidden { display:none; }
  .foot { margin-top:16px; font-size:11px; color:var(--muted); text-align:center; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand"><span class="dot"></span><h1>ILA</h1></div>

    <div class="tabs">
      <button id="tab-signin" class="active" type="button">Sign in</button>
      <button id="tab-signup" type="button">Create account</button>
    </div>

    <form id="signin-form">
      <label for="si-identifier">Email or username</label>
      <input id="si-identifier" name="identifier" autocomplete="username" required />
      <label for="si-password">Password</label>
      <input id="si-password" name="password" type="password" autocomplete="current-password" required />
      <button class="primary" type="submit">Sign in</button>
    </form>

    <form id="signup-form" class="hidden">
      <label for="su-name">Name</label>
      <input id="su-name" name="name" autocomplete="name" required />
      <label for="su-username">Username</label>
      <input id="su-username" name="username" autocomplete="username" minlength="3" maxlength="32" required />
      <label for="su-email">Email</label>
      <input id="su-email" name="email" type="email" autocomplete="email" required />
      <label for="su-password">Password (min 12 chars)</label>
      <input id="su-password" name="password" type="password" autocomplete="new-password" minlength="12" required />
      <button class="primary" type="submit">Create account</button>
    </form>

    <div id="google-block" class="${config.googleEnabled ? "" : "hidden"}">
      <div class="divider">or</div>
      <button id="google-btn" class="google" type="button">
        <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z"/><path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.8-2.9-.8-4.3s.3-3 .8-4.3l-7.8-6.1C.9 16.7 0 20.2 0 24s.9 7.3 2.6 10.4l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.4 0-11.7-3.7-13.6-9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
        Continue with Google
      </button>
    </div>

    <div id="msg" class="msg" role="status"></div>
    <div class="foot">You will be redirected back to the ILA extension after signing in.</div>
  </div>

<script>
  const CFG = ${serializeForInlineScript(cfg)};
  const $ = (id) => document.getElementById(id);
  const msg = $("msg");

  function setMsg(text, kind) { msg.textContent = text; msg.className = "msg" + (kind ? " " + kind : ""); }
  function busy(form, on) { const b = form.querySelector("button.primary"); if (b) b.disabled = on; }

  function switchTab(which) {
    const signin = which === "signin";
    $("tab-signin").classList.toggle("active", signin);
    $("tab-signup").classList.toggle("active", !signin);
    $("signin-form").classList.toggle("hidden", !signin);
    $("signup-form").classList.toggle("hidden", signin);
    setMsg("");
  }
  $("tab-signin").addEventListener("click", () => switchTab("signin"));
  $("tab-signup").addEventListener("click", () => switchTab("signup"));

  async function api(path, body) {
    const res = await fetch(CFG.authBasePath + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data && (data.message || (data.error && data.error.message)) || "Request failed (" + res.status + ")");
    }
    return data;
  }

  function onSuccess() {
    setMsg("Success — redirecting…", "ok");
    window.location.assign(bridgeUrl());
  }

  // All successful logins funnel through the backend bridge, which reads the
  // freshly-set session cookie and hands the token to the redirect target.
  function bridgeUrl() {
    return location.origin + "/auth/bridge?redirect=" + encodeURIComponent(CFG.redirectUrl);
  }

  $("signin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const identifier = $("si-identifier").value.trim();
    const password = $("si-password").value;
    busy(form, true); setMsg("Signing in…");
    try {
      // Route to username or email endpoint based on the identifier.
      if (identifier.includes("@")) {
        await api("/sign-in/email", { email: identifier, password });
      } else {
        await api("/sign-in/username", { username: identifier, password });
      }
      onSuccess();
    } catch (err) { setMsg(err.message, "error"); busy(form, false); }
  });

  $("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    busy(form, true); setMsg("Creating your account…");
    try {
      await api("/sign-up/email", {
        name: $("su-name").value.trim(),
        username: $("su-username").value.trim(),
        email: $("su-email").value.trim(),
        password: $("su-password").value,
      });
      onSuccess();
    } catch (err) { setMsg(err.message, "error"); busy(form, false); }
  });

  const gbtn = $("google-btn");
  if (gbtn) gbtn.addEventListener("click", async () => {
    setMsg("Redirecting to Google…");
    try {
      const data = await api("/sign-in/social", { provider: "google", callbackURL: bridgeUrl() });
      if (data && data.url) window.location.assign(data.url);
      else setMsg("Could not start Google sign-in.", "error");
    } catch (err) { setMsg(err.message, "error"); }
  });
</script>
</body>
</html>`;
}
import { serializeForInlineScript } from "@/views/script-data";

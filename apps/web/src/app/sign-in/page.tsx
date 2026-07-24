"use client";

import { type FormEvent, useState } from "react";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setStatus(null);
    const { error } = await signIn.email({ email, password });
    setPending(false);
    setStatus(error ? error.message ?? "Sign in failed" : "Signed in!");
  }

  async function onGoogle() {
    setStatus(null);
    await signIn.social({ provider: "google", callbackURL: "/" });
  }

  const field: React.CSSProperties = {
    width: "100%",
    padding: "11px 12px",
    background: "#0e121a",
    border: "1px solid #252b37",
    borderRadius: 9,
    color: "#e7e9ee",
    marginBottom: 12,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#151922",
          border: "1px solid #252b37",
          borderRadius: 16,
          padding: 28,
        }}
      >
        <h1 style={{ fontSize: 20, marginTop: 0 }}>Sign in to ILA</h1>
        <label style={{ fontSize: 12, color: "#98a2b3" }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={field}
        />
        <label style={{ fontSize: 12, color: "#98a2b3" }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={field}
        />
        <button
          type="submit"
          disabled={pending}
          style={{
            width: "100%",
            padding: 12,
            border: 0,
            borderRadius: 10,
            background: "#6d5efc",
            color: "#fff",
            fontWeight: 700,
            cursor: pending ? "not-allowed" : "pointer",
          }}
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <button
          type="button"
          onClick={onGoogle}
          style={{
            width: "100%",
            marginTop: 10,
            padding: 11,
            border: "1px solid #252b37",
            borderRadius: 10,
            background: "#fff",
            color: "#1f2328",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Continue with Google
        </button>

        {status && (
          <p style={{ marginTop: 14, fontSize: 13, color: "#98a2b3" }}>
            {status}
          </p>
        )}
      </form>
    </main>
  );
}

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

/**
 * Better Auth browser client.
 *
 * `baseURL` points at the ILA backend. When the web app and backend share an
 * origin behind a reverse proxy this can be left as the default.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000",
  basePath: "/api/auth",
  plugins: [usernameClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;

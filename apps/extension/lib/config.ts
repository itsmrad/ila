/**
 * Base URL of the ILA backend API.
 *
 * Configurable via a `VITE_BACKEND_URL` (or `WXT_PUBLIC_BACKEND_URL`) env var
 * at build time; falls back to the local dev backend on port 4000.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const BACKEND_URL =
  env.VITE_BACKEND_URL ?? env.WXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

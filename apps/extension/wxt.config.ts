import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

/**
 * Host permissions are derived from the backend URL so a release build cannot
 * accidentally ship with `localhost` access.
 *
 * Set `VITE_BACKEND_URL` as a real environment variable when building — Vite
 * exposes `VITE_*` from `process.env`, so the manifest and the runtime client
 * (`lib/config.ts`) always agree on the same origin.
 *
 *   VITE_BACKEND_URL=https://api.example.com bun run build
 */
const DEV_BACKEND_ORIGINS = ['http://localhost:4000/*', 'http://localhost:3005/*'];

function backendHostPermissions(): string[] {
  const configured =
    process.env.VITE_BACKEND_URL ?? process.env.WXT_PUBLIC_BACKEND_URL;

  if (!configured) return DEV_BACKEND_ORIGINS;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(
      `VITE_BACKEND_URL is not a valid URL: ${JSON.stringify(configured)}`,
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('VITE_BACKEND_URL must use http or https');
  }

  return [`${url.protocol}//${url.host}/*`];
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ILA',
    description: 'Your intelligent browser productivity assistant.',
    // `tabs` is needed to read the active tab's title/URL for page context.
    permissions: ['sidePanel', 'identity', 'storage', 'tabs'],
    host_permissions: backendHostPermissions(),
    action: { default_title: 'Open ILA' },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});

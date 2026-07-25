import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ILA',
    description: 'Your intelligent browser productivity assistant.',
    permissions: ['sidePanel', 'identity', 'storage'],
    // Needed so the extension can call the ILA backend API directly.
    host_permissions: ['http://localhost:3005/*'],
    action: { default_title: 'Open ILA' },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});

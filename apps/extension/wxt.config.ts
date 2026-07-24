import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ILA',
    description: 'Your intelligent browser productivity assistant.',
    permissions: ['sidePanel'],
    action: { default_title: 'Open ILA' },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});

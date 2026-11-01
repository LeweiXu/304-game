import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The game engine lives in ../engine as plain TypeScript source.
    alias: { '@engine': fileURLToPath(new URL('../engine/src', import.meta.url)) },
  },
  // The rules page imports ../docs/rules/rules.md and the engine sits in ../engine.
  server: { fs: { allow: ['..'] } },
  test: { environment: 'jsdom' },
});

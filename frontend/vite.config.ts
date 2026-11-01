import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The game engine (../engine) and the bots (../bots) are plain TypeScript source.
    alias: {
      '@engine': fileURLToPath(new URL('../engine/src', import.meta.url)),
      '@bots': fileURLToPath(new URL('../bots/src', import.meta.url)),
    },
  },
  // The rules page imports ../public/rules.md and the engine sits in ../engine.
  server: { fs: { allow: ['..'] } },
  test: { environment: 'jsdom' },
});

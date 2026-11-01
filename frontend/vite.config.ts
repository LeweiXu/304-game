import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The rules page imports ../docs/rules/rules.md, which sits outside this folder.
  server: { fs: { allow: ['..'] } },
  test: { environment: 'jsdom' },
});

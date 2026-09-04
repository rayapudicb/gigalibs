import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/playground-api/src/**/*.{test,spec}.{ts,tsx}',
      'packages/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/playground-web/**',
      'packages/db/src/generated/**',
    ],
  },
});

import { defineConfig } from 'vitest/config';

// WI-OI-120br: coverage gate for this package only (NFR / Done: ≥ 90 % lines, branches and functions). The normal
// test run uses the repository's root vitest.config.ts, so `pnpm test` at the root includes these tests.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});

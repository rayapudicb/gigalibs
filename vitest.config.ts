import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/workflow-platform'),
      '@gigalibs/logger': path.resolve(__dirname, './packages/logger/dist/index.js'),
      '@gigalibs/broker': path.resolve(__dirname, './packages/broker/dist/index.js'),
      '@gigalibs/audit-core': path.resolve(__dirname, './packages/audit-core/dist/index.js'),
      '@gigalibs/ar-domain': path.resolve(__dirname, './modules/accounts-receivable/domain/src/index.ts'),
      '@gigalibs/maps-core': path.resolve(__dirname, './packages/maps-core/src/index.ts'),
      '@gigalibs/maps-react': path.resolve(__dirname, './packages/maps-react/src/index.tsx'),
      '@gigalibs/rule-engine-universal': path.resolve(__dirname, './packages/rule-engine-universal/src/index.ts'),
      '@gigalibs/module-sdk': path.resolve(__dirname, './packages/module-sdk/src/index.ts'),
    },
  },

  test: {
    include: [
      'apps/playground-api/src/**/*.{test,spec}.{ts,tsx}',
      'modules/*/{domain,apps/*}/src/**/*.{test,spec}.{ts,tsx}',
      'packages/**/*.{test,spec}.{ts,tsx}',
      'apps/workflow-platform/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/playground-web/**',
      'packages/db/src/generated/**',
      'modules/communications-textfly/**',
    ],
  },
});

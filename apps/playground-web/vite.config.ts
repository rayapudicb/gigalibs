import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

const packagesDir = path.resolve(__dirname, '../../packages');

// Dynamically create aliases for all @gigalibs/* packages
const aliases: Record<string, string> = {};
const entries = fs.readdirSync(packagesDir, { withFileTypes: true });

for (const entry of entries) {
  if (entry.isDirectory()) {
    const pkgName = `@gigalibs/${entry.name}`;
    const srcDir = path.join(packagesDir, entry.name, 'src');
    if (fs.existsSync(srcDir)) {
      aliases[pkgName] = srcDir;
    }
  }
}

aliases['@xyflow/react'] = path.resolve(__dirname, '../workflow-platform/node_modules/@xyflow/react');
aliases['@xyflow/system'] = path.resolve(__dirname, '../../node_modules/.pnpm/@xyflow+system@0.0.81/node_modules/@xyflow/system');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: aliases,
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
  },
  server: {
    port: 5180,
    strictPort: false,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3333',
        changeOrigin: true,
      },
    },
  },
});

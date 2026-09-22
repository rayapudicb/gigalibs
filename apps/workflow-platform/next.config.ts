import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  transpilePackages: ['@gigalibs/broker', '@gigalibs/logger', '@gigalibs/data-import-export-react'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@gigalibs/logger': path.resolve(__dirname, '../../packages/logger/dist/logger.js'),
      '@gigalibs/broker': path.resolve(__dirname, '../../packages/broker/dist/index.js'),
      '@gigalibs/data-import-export-react': path.resolve(__dirname, '../../packages/data-import-export-react/src/index.ts'),
    };
    // Allow webpack to resolve .js imports as .ts/.tsx when transpiling workspace
    // source packages (e.g. data-import-export-react uses NodeNext .js extensions).
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;

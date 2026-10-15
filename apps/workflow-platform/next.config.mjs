import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  transpilePackages: ['@gigalibs/contracts', '@gigalibs/logger', '@gigalibs/web-sdk', '@gigalibs/cmms-web'], // data-import-export-react quarantined
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@gigalibs/logger': path.resolve(currentDirectory, '../../packages/logger/dist/logger.js'),
      // data-import-export-react quarantined — alias removed
    };
    // Allow webpack to resolve .js imports as .ts/.tsx when transpiling workspace source packages.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;

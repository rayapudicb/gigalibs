import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  transpilePackages: ['@gigalibs/broker', '@gigalibs/logger'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@gigalibs/logger': path.resolve(__dirname, '../../packages/logger/dist/logger.js'),
      '@gigalibs/broker': path.resolve(__dirname, '../../packages/broker/dist/index.js'),
    };
    return config;
  },
};

export default nextConfig;

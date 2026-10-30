import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const configRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: configRoot,
  },
  ...(process.env.NODE_ENV !== 'production'
    ? {
        allowedDevOrigins: ['127.0.0.1', 'localhost'],
      }
    : {}),
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  ...(process.env.NODE_ENV !== "production"
    ? {
        allowedDevOrigins: [
          "http://127.0.0.1:5000",
          "http://localhost:5000",
        ],
      }
    : {}),
};

export default nextConfig;

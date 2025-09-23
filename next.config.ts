import type { NextConfig } from "next";

// 在生产/CI 构建时启用严格校验（失败即终止构建），开发时保持宽松便于调试。
const isStrictBuild = process.env.NODE_ENV === 'production' || process.env.CI === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  distDir: process.env.NEXT_DIST_DIR || '.next-export',
  typescript: {
    ignoreBuildErrors: !isStrictBuild,
  },
  reactStrictMode: false,
  webpack: (config) => config,
  eslint: {
    // 构建时是否忽略 ESLint 错误
    ignoreDuringBuilds: !isStrictBuild,
  },
};

export default nextConfig;

import type { NextConfig } from "next";

// 在生产/CI 构建时启用严格校验（失败即终止构建），开发时保持宽松便于调试。
const isStrictBuild = process.env.NODE_ENV === 'production' || process.env.CI === 'true';

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: !isStrictBuild,
  },
  // 禁用 Next.js 热重载，由 nodemon 处理重编译（如需 HMR，请移除此段）
  reactStrictMode: false,
  webpack: (config, { dev }) => {
    if (dev) {
      // 禁用 webpack 的热模块替换
      config.watchOptions = {
        ignored: ['**/*'], // 忽略所有文件变化
      };
    }
    return config;
  },
  eslint: {
    // 构建时是否忽略 ESLint 错误
    ignoreDuringBuilds: !isStrictBuild,
  },
};

export default nextConfig;

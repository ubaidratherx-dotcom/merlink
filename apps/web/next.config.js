/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@merlink/types",
    "@merlink/utils",
    "@merlink/config",
    "@merlink/ui",
    "@merlink/api",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  webpack: (config) => {
    // Fix for EMFILE errors with large node_modules
    config.watchOptions = {
      ...config.watchOptions,
      poll: 1000,
      aggregateTimeout: 300,
      ignored: /node_modules/,
    };
    // Fix pino-pretty optional dependency warning
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
    };
    return config;
  },
};

module.exports = nextConfig;

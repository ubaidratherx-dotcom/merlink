/** @type {import('next').NextConfig} */
const isCapacitor = process.env.CAPACITOR_BUILD === 'true';

const nextConfig = {
  // Static export for Capacitor native builds
  ...(isCapacitor && { output: 'export' }),
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
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "http://localhost:4000/uploads/:path*",
      },
    ];
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

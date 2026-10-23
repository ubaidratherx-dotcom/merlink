/** @type {import('next').NextConfig} */
const isCapacitor = process.env.CAPACITOR_BUILD === 'true';
// Where /api and /uploads are proxied to (the Express API). Set API_ORIGIN in production.
const apiOrigin = (process.env.API_ORIGIN || 'http://localhost:4000').replace(/\/$/, '');

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
        destination: `${apiOrigin}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${apiOrigin}/uploads/:path*`,
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

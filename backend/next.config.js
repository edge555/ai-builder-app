/** @type {import('next').NextConfig} */
const nextConfig = {
  // transpilePackages: ['@ai-app-builder/shared'],

  // Production optimizations
  swcMinify: true, // Use SWC for faster minification
  productionBrowserSourceMaps: false, // Disable sourcemaps in production builds
  compress: true, // Enable gzip compression for responses
  poweredByHeader: false, // Remove X-Powered-By header for security

  // On-demand entries tuning for better memory management
  onDemandEntries: {
    maxInactiveAge: 15000, // Dispose inactive pages after 15 seconds
    pagesBufferLength: 2, // Keep only 2 pages in memory
  },
};

module.exports = nextConfig;

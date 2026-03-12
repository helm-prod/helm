/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['xlsx', 'playwright-core', '@sparticuz/chromium'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'playwright-core': false,
        '@sparticuz/chromium': false,
      }
    }

    return config
  },
}

module.exports = nextConfig

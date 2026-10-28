/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // /booking received paid traffic and 404'd. Next.js `permanent: true`
      // emits a 308, the method-preserving equivalent of a 301; crawlers and
      // ad platforms treat it the same way.
      {
        source: '/booking',
        destination: '/book',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ]
  },
  // Enable server actions for form handling
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // The HQ chief reads ads specs at runtime (read_spec); ship them with the route.
    outputFileTracingIncludes: {
      '/api/admin/ops/hq/message': ['./docs/ads-specs/**/*.md', './docs/ops/**/*.md'],
    },
  },
  // Allow images from external sources if needed
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
    ],
  },
};

module.exports = nextConfig;

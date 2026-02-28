/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/book/:slug/embed',
        headers: [
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.airtableusercontent.com' },
      { protocol: 'https', hostname: '*.cloudflare.com' },
    ],
  },
};

module.exports = nextConfig;

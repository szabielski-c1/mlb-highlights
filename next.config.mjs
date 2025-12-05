/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.mlbstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'img.mlbstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'midfield.mlbstatic.com',
      },
    ],
  },
}

export default nextConfig

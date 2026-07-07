/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '9000' },
      { protocol: 'http', hostname: 'minio' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/:path*`,
      },
    ]
  },
  transpilePackages: ['react-force-graph-2d', 'force-graph', 'd3-force-3d', 'd3-force', 'd3-timer', 'd3-dispatch', 'lodash-es'],
}

export default nextConfig

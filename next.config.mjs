/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mui/x-data-grid'],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'covers.openlibrary.org' },
      { protocol: 'https', hostname: 'covers.openlibrary.org' },
      { protocol: 'http', hostname: 'books.google.com' },
      { protocol: 'https', hostname: 'books.google.com' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
      { protocol: 'https', hostname: '**.firebasestorage.googleapis.com' },
    ],
  },
};

export default nextConfig;

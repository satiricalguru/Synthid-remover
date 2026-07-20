/** @type {import('next').NextConfig} */
const isGithubActions = process.env.GITHUB_ACTIONS || false;

const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  ...(isGithubActions
    ? {
        output: 'export',
        basePath: '/synthid-remover',
        assetPrefix: '/synthid-remover',
      }
    : {}),
};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const isGithubActions = process.env.GITHUB_ACTIONS || false;
const basePath = isGithubActions ? '/Synthid-remover' : '';

const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  ...(isGithubActions
    ? {
        output: 'export',
        basePath: '/Synthid-remover',
        assetPrefix: '/Synthid-remover',
      }
    : {}),
};

module.exports = nextConfig;

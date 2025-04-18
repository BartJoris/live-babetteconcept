// next.config.js

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  reactStrictMode: true,
  trailingSlash: true,
  assetPrefix: isProd ? './' : '',
  async rewrites() {
    return [
      {
        source: '/jsonrpc',
        destination: 'https://www.babetteconcept.be/jsonrpc',
      },
    ];
  },
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // General Hats moved from /hats to /hatting/general when Hatting became a
  // top-level nav item. These are edge redirects on purpose: the same forward
  // written as a page that calls redirect() prerenders to a STATIC route, and
  // Vercel's CDN cached a 404 for it in production (it worked under `next start`
  // locally, which is why the difference is worth the comment).
  async redirects() {
    return [
      { source: '/hats', destination: '/hatting/general', permanent: true },
      { source: '/hats/:hatId', destination: '/hatting/general/:hatId', permanent: true },
    ];
  },
};

export default nextConfig;

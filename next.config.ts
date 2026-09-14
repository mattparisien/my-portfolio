import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
        pathname: '/**',
      },
    ],
    // r2.dev has no on-the-fly resizing, so every optimized variant requires
    // downloading the full original — cache the result for a long time instead
    // of Next's 60s default so repeat visits don't re-fetch + re-encode it.
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;

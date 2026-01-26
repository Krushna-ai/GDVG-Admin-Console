import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image optimization config
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default nextConfig;


import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Workers serves original images without requiring the Images paid add-on.
    unoptimized: process.env.CLOUDFLARE_BUILD === "1",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;

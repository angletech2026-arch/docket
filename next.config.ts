import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // no dev badge in the corner, so screen recordings stay clean
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;

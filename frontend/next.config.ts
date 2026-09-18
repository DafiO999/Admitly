import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_ORIGIN ?? "http://127.0.0.1:3001"}/api/:path*` }];
  },
};
export default nextConfig;

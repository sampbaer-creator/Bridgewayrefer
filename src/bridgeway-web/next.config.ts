import type { NextConfig } from "next";
const origin = process.env.BRIDGEWAY_API_ORIGIN || "http://127.0.0.1:5180";
const config: NextConfig = {
  output: "standalone",
  async rewrites() {
    return ["/api/:path*", "/health/:path*", "/staff/login", "/signin-oidc"].map(source => ({ source, destination: origin + source }));
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Cache-Control", value: "no-store" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://login.microsoftonline.com; object-src 'none'" },
    ] }];
  },
};
export default config;

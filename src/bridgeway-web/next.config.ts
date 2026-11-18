import type { NextConfig } from "next";
const developmentScripts = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
const config: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Cache-Control", value: "no-store" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${developmentScripts}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://login.microsoftonline.com https://*.ciamlogin.com https://api.stripe.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://login.microsoftonline.com https://*.ciamlogin.com; object-src 'none'; upgrade-insecure-requests` },
    ] }, { source: "/(staff|admin|r|signup|sign-in)/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};
export default config;


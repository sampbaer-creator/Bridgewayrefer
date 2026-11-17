import type { Metadata, Viewport } from "next";
import { PT_Serif } from "next/font/google";
import Link from "next/link";
import { siteDescription, siteOrigin } from "../lib/site";
import type { ReactNode } from "react";
import Header from "../components/Header";
import "./globals.css";
import "./staff.css";
import "./landing.css";
import "./site.css";

const ptSerif = PT_Serif({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap", variable: "--font-body" });

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: "Referral tracking and NFC cards | BridgeWay", template: "%s | BridgeWay" },
  description: siteDescription,
  openGraph: { type: "website", siteName: "BridgeWay", title: "Referral tracking and NFC cards | BridgeWay", description: siteDescription, images: [{ url: "/share.png", width: 1200, height: 630, alt: "BridgeWay referral tracking" }] },
  twitter: { card: "summary_large_image", images: ["/share.png"] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={ptSerif.variable}>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Header />
        {children}
        <footer className="site-footer">
          <div className="footer-inner">
            <Link className="footer-brand" href="/" aria-label="BridgeWayRefer home">
              <img className="footer-brand-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={105} height={36} />
            </Link>
            <p className="footer-tag">Referrals, followed through.</p>
            <nav aria-label="Footer">
              <a href="/pricing">Pricing</a>
              <a href="/contact">Contact</a>
              <a href="/security">Security</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
            </nav>
            <p className="footer-fine">© {new Date().getFullYear()} BridgeWay · Built for healthcare and home service teams.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}


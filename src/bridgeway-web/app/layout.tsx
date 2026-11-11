import type { Metadata } from "next";
import { siteDescription, siteOrigin } from "../lib/site";
import type { ReactNode } from "react";
import Header from "../components/Header";
import "./globals.css";
import "./launch.css";
import "./launch-extra.css";
import "./access.css";
import "./uidesign.css";
import "./staff-dashboard.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: "Referral tracking and NFC cards | BridgeWay", template: "%s | BridgeWay" },
  description: siteDescription,
  openGraph: { type: "website", siteName: "BridgeWay", title: "Referral tracking and NFC cards | BridgeWay", description: siteDescription, images: [{ url: "/share.png", width: 1200, height: 630, alt: "BridgeWay referral tracking" }] },
  twitter: { card: "summary_large_image", images: ["/share.png"] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><Header />{children}<footer className="site-footer"><span>BridgeWay · Referrals, followed through.</span><nav aria-label="Footer"><a href="/pricing">Pricing</a><a href="/contact">Contact</a><a href="/security">Security</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav></footer></body></html>;
}


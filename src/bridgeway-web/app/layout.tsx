import type { ReactNode } from "react";
import Header from "../components/Header";
import "./globals.css";
import "./launch.css";
import "./launch-extra.css";
import "./access.css";
import "./uidesign.css";

export const metadata = { title: "Bridgewayrefer · Referral follow-up" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><Header />{children}<footer className="site-footer"><span>Bridgewayrefer · Private referrals, clearer follow-up.</span></footer></body></html>;
}

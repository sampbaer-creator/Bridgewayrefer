import type { ReactNode } from "react";
import Header from "../components/Header";
import "./globals.css";

export const metadata = { title: "BridgeWay" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Header />
        {children}
        <footer className="site-footer"><span>Saratoga Springs Orthodontics · BridgeWay</span><span>A confident smile starts here.</span></footer>
      </body>
    </html>
  );
}

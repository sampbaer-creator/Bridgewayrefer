"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const path = usePathname();
  if (path.startsWith("/r/")) return null;
  const staff = path.startsWith("/staff");
  const admin = path === "/admin";
  async function logout() {
    await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    window.localStorage.removeItem("bridgeway.workspace");
    window.location.assign("/sign-in");
  }
  return <header className="site-header"><div className="header-inner">
    <Link className="brand" href="/" aria-label="BridgeWay home">
      <img className="brand-mark" src="/brand-mark.png" alt="" width={32} height={32} />
      <span className="brand-name">Bridge<span className="brand-accent">Way</span></span>
    </Link>
    {staff || admin ? <div className="staff-header-actions"><span className="portal-label">{admin ? "PLATFORM ADMIN" : "STAFF WORKSPACE"}</span><button className="header-signout" onClick={logout}>Sign out</button></div> : <nav className="public-nav" aria-label="Main navigation"><a href="/#how-it-works">How it works</a><a href="/industries/dental">Dental</a><a href="/industries/trades">Trades</a><a href="/pricing">Pricing</a><a className="public-nav-signin" href="/staff/login">Sign in</a><a className="public-nav-cta" href="/contact">Request a walkthrough</a></nav>}
  </div></header>;
}

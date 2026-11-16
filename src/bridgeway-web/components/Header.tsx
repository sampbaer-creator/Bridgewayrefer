"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Header() {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  if (path.startsWith("/r/")) return null;
  const staff = path.startsWith("/staff");
  const admin = path === "/admin";
  async function logout() {
    await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    window.localStorage.removeItem("bridgeway.workspace");
    window.location.assign("/sign-in");
  }
  return <header className="site-header"><div className="header-inner">
    <Link className="brand" href="/" aria-label="BridgeWayRefer home">
      <img className="brand-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={128} height={44} />
    </Link>
    {staff || admin ? <div className="staff-header-actions"><span className="portal-label">{admin ? "PLATFORM ADMIN" : "STAFF WORKSPACE"}</span><button className="header-signout" onClick={logout}>Sign out</button></div> : <>
      <nav className="public-nav" aria-label="Main navigation"><a href="/#how-it-works">How it works</a><a href="/industries/dental">Dental</a><a href="/industries/trades">Trades</a><a href="/pricing">Pricing</a><a className="public-nav-signin" href="/staff/login">Sign in</a><a className="public-nav-cta" href="/signup?plan=workspace">Get started</a></nav>
      <button type="button" className="menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen((open) => !open)}><span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span></button>
    </>}
  </div>
  {!staff && !admin && menuOpen && <nav className="mobile-menu" id="mobile-menu" aria-label="Mobile navigation" onClick={() => setMenuOpen(false)}>
    <a href="/#how-it-works">How it works</a><a href="/industries/dental">Dental</a><a href="/industries/trades">Trades</a><a href="/pricing">Pricing</a><a href="/staff/login">Sign in</a><a className="mobile-menu-cta" href="/signup?plan=workspace">Get started</a>
  </nav>}
  </header>;
}

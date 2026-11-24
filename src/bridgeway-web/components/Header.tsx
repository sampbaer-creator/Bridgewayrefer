"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const publicLinks = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Healthcare", href: "/industries/healthcare" },
  { label: "Trades", href: "/industries/trades" },
] as const;

export default function Header() {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") {
      setMenuOpen(false);
      menuToggle.current?.focus();
    } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  if (path.startsWith("/p/") || path.startsWith("/r/")) return null;
  const staff = path.startsWith("/staff");
  const admin = path === "/admin";
  async function logout() {
    await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    window.localStorage.removeItem("bridgeway.workspace");
    window.location.assign("/sign-in");
  }
  const internal = staff || admin;
  const navLinks = <>{publicLinks.map(({ label, href }) => (
    <Link key={href} href={href} aria-current={path === href ? "page" : undefined} onClick={() => setMenuOpen(false)}>{label}</Link>
  ))}<details className="about-menu" key={path} onKeyDown={e => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}><summary>About</summary><div>{[["FAQ","/faq"],["Blog","/blog"],["Our Story","/our-story"]].map(([label, href]) => <Link key={href} href={href} onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); setMenuOpen(false); }}>{label}</Link>)}</div></details></>;

  return <header className={internal ? "site-header" : "site-header public-header"}><div className="header-inner">
    <Link className="brand" href="/" aria-label="BridgeWayRefer home">
      <img className="brand-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={128} height={44} />
    </Link>
    {staff || admin ? <div className="staff-header-actions"><span className="portal-label">{admin ? "PLATFORM ADMIN" : "STAFF WORKSPACE"}</span><button className="header-signout" onClick={logout}>Sign out</button></div> : <>
      <nav className="public-nav" aria-label="Main navigation">{navLinks}</nav>
      <div className="public-header-actions">
        <Link className="public-nav-signin" href="/sign-in" aria-current={path === "/sign-in" ? "page" : undefined}>Sign in</Link>
        <Link className="public-nav-cta" href={["/signup", "/sign-in"].includes(path) ? "/contact#walkthrough" : "#walkthrough"}>Request a walkthrough</Link>
        <button ref={menuToggle} type="button" className="menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(open => !open)}><span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span></button>
      </div>
    </>}
  </div>
  {!internal && <nav className="mobile-menu" id="mobile-menu" aria-label="Mobile navigation" hidden={!menuOpen}>
    {navLinks}
    <Link href="/sign-in" onClick={() => setMenuOpen(false)}>Sign in</Link>
  </nav>}
  </header>;
}

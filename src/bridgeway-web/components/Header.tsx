"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function Header() {
  const staff = usePathname().startsWith("/staff");
  async function logout() { await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); window.location.assign("/sign-in"); }
  return <header className="site-header"><div className="header-inner">
    <Link className="brand" href="/" aria-label="Referral home"><img src="/brand-logo.png" alt="Saratoga Springs Orthodontics" width="230" height="85" /></Link>
    {staff ? <div className="staff-header-actions"><span className="portal-label">● OFFICE REFERRAL PORTAL</span><button className="header-signout" onClick={logout}>Sign out ↗</button></div>
      : <a className="header-contact" href="tel:8017684554"><span>OUR TEAM IS HERE TO HELP</span>801.768.4554 <span aria-hidden="true">↗</span></a>}
  </div></header>;
}

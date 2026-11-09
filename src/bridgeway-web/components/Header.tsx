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
  return <header className="site-header"><div className="header-inner launch-header">
    <Link className="bridgeway-brand" href="/" aria-label="BridgeWay home"><span className="brand-mark" aria-hidden="true">B</span><span>BridgeWay</span></Link>
    {staff || admin ? <div className="staff-header-actions"><span className="portal-label">{admin ? "CARD ADMINISTRATION" : "STAFF WORKSPACE"}</span><button className="header-signout" onClick={logout}>Sign out</button></div> : null}
  </div></header>;
}

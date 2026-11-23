import Link from "next/link";

export const metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="muted">This address does not match a BridgeWay page.</p>
        <p><Link className="bw-btn bw-btn-primary" href="/">Return home</Link> <Link className="bw-btn bw-btn-ghost" href="/contact">Contact BridgeWay</Link></p>
      </section>
    </main>
  );
}

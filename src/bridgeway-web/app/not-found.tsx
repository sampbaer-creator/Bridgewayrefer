import Link from "next/link";
export default function NotFound() { return <main className="dashboard" id="main-content"><section className="card"><h1>Page not found</h1><p>This address does not match a BridgeWay page.</p><p><Link href="/">Return home</Link> or <Link href="/contact">contact BridgeWay</Link>.</p></section></main>; }

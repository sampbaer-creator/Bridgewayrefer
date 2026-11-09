import Link from "next/link";
export default function NotFound() { return <main className="dashboard" id="main-content"><section className="card session-expired"><h1>This link is unavailable.</h1><p>The card may have been deactivated. Please contact our office or use the general request form.</p><Link href="/">Open the request form</Link></section></main>; }

import Link from "next/link";
import Image from "next/image";

export const metadata = { title: "BridgeWay | Referrals, followed through", alternates: { canonical: "/" } };

export default function HomePage() {
  return <main className="editorial" id="main-content">
    <section className="cover">
      <div className="cover-copy">
        <h1>Referrals, followed through.</h1>
        <p>Partners share your referral card. Customers tap or scan, complete a short form, and arrive in your team?s referral inbox. See who sent them and assign the follow-up.</p>
        <a className="editorial-button" href="#walkthrough">Request a walkthrough</a>
      </div>
      <Image src="/photos/office.jpg" alt="Daylight across a shared office" width={1440} height={961} preload sizes="(max-width: 720px) 100vw, 55vw" />
    </section>
    <section className="industry-section">
      <h2>Who we work with</h2>
      <div className="industry-grid">{[
        ["healthcare", "Healthcare", "From the referring office to the team scheduling the visit."],
        ["trades", "Trades", "From a contractor’s introduction to the next service call."],
      ].map(([slug, title, copy]) => <Link key={slug} href={`/industries/${slug}`}>
        <Image src={`/photos/${slug}.jpg`} width={720} height={450} alt="" sizes="(max-width: 720px) 100vw, 45vw" />
        <h3>{title}</h3><p>{copy}</p>
      </Link>)}</div>
    </section>
    <section className="handoff"><h2>One tap starts the handoff.</h2><p>A partner shares your card. The customer taps or scans, fills out a short form, and appears in your referral inbox. Assign the follow-up and record what happens next.</p></section>
  </main>;
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Referral Tracking Software for Partner Introductions",
  description: "Track incoming partner referrals by source, receiving location, owner and status. See how BridgeWay referral tracking software supports follow-up.",
  alternates: { canonical: "/referral-tracking-software" },
};

export default function ReferralTrackingSoftwarePage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">REFERRAL TRACKING SOFTWARE</p>
        <h1>Referral tracking software for partner introductions.</h1>
        <p className="bw-page-sub">
          Referral tracking software records the partner and location behind an incoming request, then helps your team see its follow-up status in one inbox.
        </p>
        <div className="bw-hero-actions">
          <Link className="bw-btn bw-btn-primary" href="/contact">Book a referral tracking demo</Link>
          <Link className="bw-btn bw-btn-ghost" href="/how-it-works">See how it works</Link>
        </div>
      </section>

      <section className="bw-section" aria-label="What referral tracking records">
        <div className="bw-section-head">
          <p className="eyebrow">FROM SOURCE TO STATUS</p>
          <h2>Know where a request came from and what happens next.</h2>
          <p className="bw-section-sub">BridgeWay referral tracking software is built for incoming business introductions shared by a partner.</p>
        </div>
        <div className="bw-two-col">
          <article className="bw-card">
            <h3>Capture the source at the handoff</h3>
            <p>Assign a link to a partner and receiving location. When the customer submits the form, the referral arrives with that source attached.</p>
          </article>
          <article className="bw-card">
            <h3>Follow the request in your inbox</h3>
            <p>Review new referrals, assign staff, update status and compare submitted requests by referring partner over a consistent period.</p>
          </article>
        </div>
      </section>

      <section className="bw-section bw-section-alt" aria-label="Referral tracking scope">
        <div className="bw-doc">
          <h2>Built for referral intake and follow-up.</h2>
          <p>Some referral tracking software focuses on customer reward programs or affiliate commissions. BridgeWay focuses on business introductions: capturing who sent a request, routing it to a receiving team and making follow-up status visible.</p>
          <p>For healthcare practices, the workflow captures a patient&rsquo;s request for contact. It does not replace an electronic clinical referral exchange, EHR or practice management system.</p>
        </div>
      </section>

      <section className="bw-section" aria-label="Referral tracking by industry">
        <div className="bw-two-col">
          <article>
            <p className="eyebrow">HEALTHCARE</p>
            <h2>Patient referral tracking for practices.</h2>
            <p>See the referring office, receiving location and next follow-up step for a submitted patient request.</p>
            <p><Link href="/industries/healthcare">Explore healthcare referral tracking</Link></p>
          </article>
          <article>
            <p className="eyebrow">HOME SERVICES</p>
            <h2>Partner referrals for contractors.</h2>
            <p>Record which partner sent a job lead and who will contact the homeowner.</p>
            <p><Link href="/industries/trades">Explore contractor referral tracking</Link></p>
          </article>
        </div>
      </section>

      <section className="bw-section" aria-label="Get started">
        <div className="bw-cta-band">
          <h2>See a partner referral move through BridgeWay.</h2>
          <p>Review the form, source attribution, team inbox and current plans.</p>
          <Link className="bw-btn bw-btn-light" href="/contact">Book a demo</Link>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Referral Management Software for Partner Follow-up",
  description: "Manage partner referrals in one workspace. Capture the source, assign follow-up, update status and review referral activity with BridgeWay.",
  alternates: { canonical: "/referral-management-software" },
};

export default function ReferralManagementSoftwarePage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">REFERRAL MANAGEMENT SOFTWARE</p>
        <h1>Referral management software for partner follow-up.</h1>
        <p className="bw-page-sub">
          Referral management software gives your team a shared place to capture an introduction, see who sent it, assign the next contact and record its status.
        </p>
        <div className="bw-hero-actions">
          <Link className="bw-btn bw-btn-primary" href="/contact">Book a referral workflow demo</Link>
          <Link className="bw-btn bw-btn-ghost" href="/pricing">See plans and pricing</Link>
        </div>
      </section>

      <section className="bw-section" aria-label="Referral management workflow">
        <div className="bw-section-head">
          <p className="eyebrow">ONE TEAM WORKFLOW</p>
          <h2>Keep the source and next action together.</h2>
          <p className="bw-section-sub">A consistent referral management workflow helps staff know what arrived, who owns it and what needs attention.</p>
        </div>
        <div className="bw-flow" aria-label="Capture, assign and review referrals">
          <div className="bw-flow-step"><span className="bw-flow-num">01</span><p className="hint">CAPTURE</p><p><strong>Record the introduction</strong></p><p>Partner-specific links attach the referring source when a customer sends a request.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">02</span><p className="hint">ASSIGN</p><p><strong>Choose the next contact</strong></p><p>Review new requests in the inbox and assign a staff member to follow up.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">03</span><p className="hint">REVIEW</p><p><strong>Update status and outcome</strong></p><p>Keep the current status visible and review referral activity by source.</p></div>
        </div>
      </section>

      <section className="bw-section bw-section-alt" aria-label="Referral management features">
        <div className="bw-two-col">
          <article>
            <p className="eyebrow">FOR YOUR TEAM</p>
            <h2>One inbox for new referrals.</h2>
            <p>See the referral source, receiving location and follow-up status together. Staff can review open requests, assign an owner and keep the next step in view.</p>
          </article>
          <article>
            <p className="eyebrow">FOR YOUR PARTNERS</p>
            <h2>A simple handoff by tap or scan.</h2>
            <p>Give each partner a branded NFC card or QR link. The customer opens a form in their browser, and the submitted request carries the partner attribution into your workspace.</p>
          </article>
        </div>
      </section>

      <section className="bw-section">
        <div className="bw-card">
          <h2>Start with the workflow you use today.</h2>
          <p className="bw-section-sub">Compare a manual referral spreadsheet with a team-managed follow-up pipeline, or see the referral tracking features and current plans.</p>
          <p><Link href="/compare/spreadsheet">Spreadsheet vs. referral pipeline</Link> · <Link href="/referral-tracking-software">Referral tracking software</Link> · <Link href="/industries/healthcare">Healthcare workflow</Link></p>
        </div>
      </section>

      <section className="bw-section" aria-label="Request a demo">
        <div className="bw-cta-band">
          <h2>See referral management in your team&rsquo;s workflow.</h2>
          <p>Share your current handoff process and the number of locations you want to support.</p>
          <Link className="bw-btn bw-btn-light" href="/contact">Book a demo</Link>
        </div>
      </section>
    </main>
  );
}

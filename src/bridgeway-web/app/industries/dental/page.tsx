import Link from "next/link";

export const metadata = { title: "Dental and orthodontic referral tracking", description: "Help referring dental offices send patient introductions to your orthodontic practice, then track each referral through follow-up and a scheduled visit.", alternates: { canonical: "/industries/dental" }, openGraph: { title: "Dental and orthodontic referrals | BridgeWay", description: "A branded partner handoff that your orthodontic team can follow through to a scheduled visit." } };

export default function DentalIndustryPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">FOR DENTAL & ORTHODONTIC TEAMS</p>
        <h1>Make every referring office easy to follow up with.</h1>
        <p className="muted">A general dentist shares a BridgeWay card with a patient. The patient opens your practice’s short referral form, and your team sees which office sent them.</p>
        <div className="bw-hero-actions">
          <Link className="bw-btn bw-btn-primary" href="/signup?plan=workspace">Get started →</Link>
          <Link className="bw-btn bw-btn-ghost" href="/#how-it-works">See the handoff</Link>
        </div>
      </section>

      <section className="bw-section" aria-label="Dental referral workflow">
        <div className="bw-flow" aria-label="Dental referral workflow">
          <div className="bw-flow-step"><span className="bw-flow-num">01</span><p className="hint">REFERRING OFFICE</p><p><b>General dentist</b></p><p className="muted">Shares a card assigned to their office.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">02</span><p className="hint">RECEIVING PRACTICE</p><p><b>Orthodontic team</b></p><p className="muted">Receives an attributed patient request.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">03</span><p className="hint">FOLLOW-UP</p><p><b>Scheduled visit</b></p><p className="muted">Assigns contact and records the outcome.</p></div>
        </div>
      </section>

      <section className="bw-section bw-section-alt" aria-label="What the patient and your team see">
        <div className="bw-two-col">
          <div>
            <p className="eyebrow">WHAT THE PATIENT SEES</p>
            <h2>A short, branded request for contact.</h2>
            <p>The form identifies your practice, asks for the contact details your team needs, and explains what happens next. Keep the first version focused on follow-up; do not request clinical details until your data requirements and handling arrangements are settled.</p>
          </div>
          <div>
            <p className="eyebrow">WHAT YOUR TEAM RECEIVES</p>
            <h2>Attribution beside the next action.</h2>
            <p>See the referring office, receiving location, assigned staff member, status, and contact history together. Follow the introduction to a scheduled visit and compare partners using consistent reporting.</p>
          </div>
        </div>
      </section>

      <section className="bw-section" aria-label="Get started">
        <div className="bw-cta-band">
          <h2>Start with one practice and a few referring offices.</h2>
          <p>We’ll walk through your card handoff, workspace setup, and the first referral workflow.</p>
          <Link className="bw-btn bw-btn-light" href="/signup?plan=workspace">Get started →</Link>
        </div>
      </section>
    </main>
  );
}

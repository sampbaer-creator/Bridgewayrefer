import Link from "next/link";

export const metadata = { title: "Patient Referral Management Software for Healthcare", description: "Patient referral management software for contact intake, referring office attribution and team follow-up. BridgeWay does not exchange clinical records.", alternates: { canonical: "/industries/healthcare" }, openGraph: { title: "Patient referral management | BridgeWay", description: "Capture patient requests from referring offices and organize team follow-up." } };

export default function HealthcareIndustryPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">FOR HEALTHCARE TEAMS</p>
        <h1>Patient referral management software for healthcare teams.</h1>
        <p className="muted">Patient referral management software helps dental and medical teams capture contact requests, identify the referring office and organize follow-up in one inbox. Patient referral software should make the source and next contact clear to the receiving team.</p>
        <div className="bw-hero-actions">
          <Link className="bw-btn bw-btn-primary" href="/signup?plan=workspace">Get started →</Link>
          <Link className="bw-btn bw-btn-ghost" href="#referral-workflow">See the handoff</Link>
        </div>
      </section>

      <section className="bw-section" aria-label="Dental patient referral workflow">
        <div className="bw-section-head">
          <p className="eyebrow">DENTAL INTAKE AND FOLLOW-UP</p>
          <h2>Track patient referrals from the referring office.</h2>
          <p className="bw-section-sub">A dental referral software workflow can connect a partner handoff with the receiving practice&rsquo;s next contact.</p>
        </div>
        <div className="bw-two-col">
          <article>
            <h3>Patient request for contact</h3>
            <p>A referring dentist shares a card or QR link. The patient opens the receiving practice&rsquo;s branded form and submits contact information so the team can respond.</p>
          </article>
          <article>
            <h3>Referring office attribution</h3>
            <p>The practice sees the referring office and receiving location with the submitted request, then assigns staff and records the follow-up status.</p>
          </article>
        </div>
        <div className="bw-card" style={{ marginTop: "1.5rem" }}>
          <h3>What healthcare referral management covers here</h3>
          <p>This patient referral management workflow supports contact intake, source attribution and team follow-up. When comparing medical referral management software, confirm that its features match the clinical coordination your organization needs. BridgeWay does not exchange clinical records or replace an EHR, practice management system or clinical referral network.</p>
        </div>
      </section>

      <section className="bw-section" id="referral-workflow" aria-label="Healthcare referral workflow">
        <div className="bw-flow" aria-label="Healthcare referral workflow">
          <div className="bw-flow-step"><span className="bw-flow-num">01</span><p className="hint">REFERRING OFFICE</p><p><b>Healthcare provider</b></p><p className="muted">Shares a card assigned to their office.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">02</span><p className="hint">RECEIVING PRACTICE</p><p><b>Medical or dental specialist</b></p><p className="muted">Receives an attributed patient request.</p></div>
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

      <section className="bw-section" aria-label="Healthcare specialties">
        <h2>One referral workflow across healthcare.</h2>
        <p>Support medical specialties such as cardiology, dermatology, orthopedics, physical therapy, and mental health, alongside general dentistry, orthodontics, endodontics, periodontics, and oral surgery.</p>
        <p>Choose your specialty during signup, or type your own to describe your practice.</p>
      </section>

      <section className="bw-section" aria-label="Get started">
        <div className="bw-cta-band">
          <h2>Start with one practice and a few referring offices.</h2>
          <p>We’ll walk through your card handoff, workspace setup, and the first referral workflow.</p>
          <Link className="bw-btn bw-btn-light" href="/signup?plan=workspace">Get started →</Link>
        </div>
      </section>
      <p className="bw-doc"><a href="/industries/dental">Explore orthodontic referral tracking</a></p>
    </main>
  );
}


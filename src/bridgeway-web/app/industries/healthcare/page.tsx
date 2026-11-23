import Link from "next/link";

export const metadata = { title: "Dental & Orthodontic Referral Tracking", description: "Dental referral tracking helps your practice capture patient referrals, see the referring dentist, and follow up in one inbox.", alternates: { canonical: "/industries/healthcare" }, openGraph: { title: "Healthcare referrals | BridgeWay", description: "A branded partner handoff that your healthcare team can follow through to a scheduled visit." } };

export default function HealthcareIndustryPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">FOR HEALTHCARE TEAMS</p>
        <h1>Dental referral tracking for referring offices</h1>
        <p className="muted">Dental referral tracking helps your practice capture patient referrals, see the referring dentist, and follow up in one inbox.</p>
        <div className="bw-hero-actions">
          <Link className="bw-btn bw-btn-primary" href="/signup?plan=workspace">Get started →</Link>
          <Link className="bw-btn bw-btn-ghost" href="#referral-workflow">See the handoff</Link>
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


import Link from "next/link";

export const metadata = { title: "Home Service Referral Tracking", description: "Home service referral tracking helps contractors capture job leads, credit the partner who sent them, and track follow-up.", alternates: { canonical: "/industries/trades" }, openGraph: { title: "Home service referral tracking | BridgeWay", description: "Attribute partner introductions and track each homeowner request through follow-up and a booked job." } };

export default function TradesIndustryPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">FOR HOME SERVICE TEAMS</p>
        <h1>Home service referral tracking for booked jobs</h1>
        <p className="muted">Home service referral tracking helps contractors capture job leads, credit the partner who sent them, and track follow-up.</p>
        <div className="bw-hero-actions">
          <Link className="bw-btn bw-btn-primary" href="/signup?plan=workspace">Get started →</Link>
          <Link className="bw-btn bw-btn-ghost" href="#referral-workflow">See the handoff</Link>
        </div>
      </section>

      <section className="bw-section" id="referral-workflow" aria-label="Home service referral workflow">
        <div className="bw-flow" aria-label="Home service referral workflow">
          <div className="bw-flow-step"><span className="bw-flow-num">01</span><p className="hint">REFERRING PARTNER</p><p><b>Plumber or property manager</b></p><p className="muted">Shares a card assigned to the partner.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">02</span><p className="hint">RECEIVING TEAM</p><p><b>HVAC company</b></p><p className="muted">Gets the homeowner request and service details.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">03</span><p className="hint">FOLLOW-UP</p><p><b>Booked job</b></p><p className="muted">Assigns a call and records the outcome.</p></div>
        </div>
      </section>

      <section className="bw-section bw-section-alt" aria-label="What the homeowner and your team see">
        <div className="bw-two-col">
          <div>
            <p className="eyebrow">WHAT THE HOMEOWNER SEES</p>
            <h2>A clear way to ask for service.</h2>
            <p>The mobile form names your business and explains what happens after submission. Ask only for the information your team needs to respond, such as service type and ZIP code.</p>
          </div>
          <div>
            <p className="eyebrow">WHAT YOUR TEAM RECEIVES</p>
            <h2>Partner attribution with follow-up.</h2>
            <p>See the referring partner, branch or service team, assignee, status, and contact history together. Follow requests through to booked jobs and compare partner activity over the same reporting periods.</p>
          </div>
        </div>
      </section>

      <section className="bw-section" aria-label="Get started">
        <div className="bw-cta-band">
          <h2>Start with one branch and a few referral partners.</h2>
          <p>We’ll walk through your card handoff, workspace setup, and the first referral workflow.</p>
          <Link className="bw-btn bw-btn-light" href="/signup?plan=workspace">Get started →</Link>
        </div>
      </section>
    </main>
  );
}

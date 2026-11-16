import Link from "next/link";

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const metadata = { title: "Pricing", alternates: { canonical: "/pricing" } };

export default function PricingPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">PRICING</p>
        <h1>Simple monthly plans.<br />NFC cards included.</h1>
        <p className="muted">Track referrals yourself, or let us make the follow-up calls.</p>
      </section>

      <section className="bw-section" aria-label="Monthly plans">
        <div className="bw-pricing-grid">
          <article className="bw-plan-card">
            <h3>Referral Workspace</h3>
            <div className="bw-plan-price">
              <span className="bw-currency">$</span>
              <strong>50</strong>
              <span className="bw-per">/ location / month</span>
            </div>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}NFC cards included</li>
              <li>{CHECK_ICON}Referral tracking</li>
              <li>{CHECK_ICON}Unlimited partners</li>
              <li>{CHECK_ICON}Staff invitations</li>
              <li>{CHECK_ICON}Monthly reporting</li>
            </ul>
            <Link className="bw-btn bw-btn-primary bw-btn-block" href="/signup?plan=workspace">Get started</Link>
          </article>
          <article className="bw-plan-card">
            <h3>Managed Calling</h3>
            <div className="bw-plan-price">
              <span className="bw-currency">$</span>
              <strong>400</strong>
              <span className="bw-per">/ location / month</span>
            </div>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}Includes the $50 workspace plan per location</li>
              <li>{CHECK_ICON}Our team calls your referrals</li>
              <li>{CHECK_ICON}Follow-up recorded in your workspace</li>
              <li>{CHECK_ICON}Calling hours confirmed during setup</li>
            </ul>
            <Link className="bw-btn bw-btn-primary bw-btn-block" href="/signup?plan=managed-calling">Get Managed Calling</Link>
          </article>
          <article className="bw-plan-card">
            <h3>Custom</h3>
            <div className="bw-plan-price"><strong>Let&rsquo;s talk</strong></div>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}For corporate groups and many locations</li>
              <li>{CHECK_ICON}Volume pricing</li>
              <li>{CHECK_ICON}Guided setup</li>
              <li>{CHECK_ICON}NFC cards included</li>
            </ul>
            <Link className="bw-btn bw-btn-primary bw-btn-block" href="/contact">Request a custom quote</Link>
          </article>
        </div>
        <p className="bw-price-fine">Every card link also works as a QR code. Customers need no app.</p>
      </section>

      <section className="bw-section bw-section-alt" aria-label="What setup involves">
        <div className="bw-section-head">
          <p className="eyebrow">WHAT SETUP INVOLVES</p>
          <h2>Four steps to your first referral.</h2>
        </div>
        <div className="bw-flow" aria-label="Setup steps">
          <div className="bw-flow-step"><span className="bw-flow-num">01</span><p>Sign up and subscribe.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">02</span><p>Add your locations and partners.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">03</span><p>Request your NFC cards.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">04</span><p>Test a card and alerts, then go live.</p></div>
        </div>
      </section>

      <section className="bw-section" aria-label="NFC cards and billing">
        <div className="bw-two-col">
          <div>
            <p className="eyebrow">NFC CARDS</p>
            <h2>NFC cards come with your plan.</h2>
            <p>Your subscription includes your NFC cards. Need more or replacements? Request them from your workspace.</p>
          </div>
          <div>
            <p className="eyebrow">BILLING</p>
            <h2>Manage billing in your workspace.</h2>
            <p>Update payment details or cancel any time from Billing.</p>
            <p>New workspaces start with intake off until you are ready to go live.</p>
          </div>
        </div>
        <Link className="bw-btn bw-btn-secondary" href="/contact">Questions? Contact us</Link>
      </section>
    </main>
  );
}

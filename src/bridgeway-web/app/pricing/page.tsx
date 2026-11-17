import Link from "next/link";

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const metadata = { title: "Pricing", description: "Referral Workspace is $50 per business per month with all locations included, unlimited referrals and partners, and NFC cards for your partners. Managed Calling adds cold calling and CRM support for $400 per business per month.", alternates: { canonical: "/pricing" } };

export default function PricingPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">PRICING</p>
        <h1>Simple monthly plans.<br />No per-referral fees.</h1>
        <p className="muted">Track referrals yourself, or let us make the follow-up calls.</p>
      </section>

      <section className="bw-section" aria-label="Monthly plans">
        <div className="bw-pricing-grid">
          <article className="bw-plan-card">
            <h3>Referral Workspace</h3>
            <div className="bw-plan-price">
              <span className="bw-currency">$</span>
              <strong>50</strong>
              <span className="bw-per">/ business / month</span>
            </div>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}All locations included</li>
              <li>{CHECK_ICON}NFC cards for your partners</li>
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
              <li>{CHECK_ICON}Includes the full $50 Referral Workspace plan</li>
              <li>{CHECK_ICON}BridgeWay handles cold calling and CRM follow-up</li>
              <li>{CHECK_ICON}Our team calls your referrals</li>
              <li>{CHECK_ICON}Follow-up recorded in your workspace</li>
              <li>{CHECK_ICON}Calling hours confirmed during setup</li>
            </ul>
            <Link className="bw-btn bw-btn-primary bw-btn-block" href="/signup?plan=managed-calling">Get Managed Calling</Link>
          </article>
          <article className="bw-plan-card">
            <h3>Corporate</h3>
            <div className="bw-plan-price"><strong>Let&rsquo;s talk</strong></div>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}For corporate groups and many locations</li>
              <li>{CHECK_ICON}Volume pricing</li>
              <li>{CHECK_ICON}Guided setup</li>
              <li>{CHECK_ICON}NFC cards for every location</li>
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
            <h2>NFC cards for your partners.</h2>
            <p>Order your first set of NFC cards from your workspace. Replacements and additional cards are quoted per order — request them any time.</p>
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

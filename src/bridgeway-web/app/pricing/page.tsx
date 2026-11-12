import Link from "next/link";

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const metadata = { title: "Pricing and NFC cards", alternates: { canonical: "/pricing" } };

export default function PricingPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">PRICING</p>
        <h1>Simple monthly plans,<br />cards sold separately.</h1>
        <p className="muted">Start with the Referral Workspace your team uses every day, or hand the follow-up calls to BridgeWay with Managed Calling.</p>
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
              <li>{CHECK_ICON}Referral tracking</li>
              <li>{CHECK_ICON}Offices and partners</li>
              <li>{CHECK_ICON}Staff invitations</li>
              <li>{CHECK_ICON}Monthly reporting</li>
            </ul>
            <Link className="bw-btn bw-btn-primary bw-btn-block" href="/signup?plan=workspace">Choose Referral Workspace</Link>
          </article>
          <article className="bw-plan-card">
            <h3>Managed Calling</h3>
            <div className="bw-plan-price">
              <span className="bw-currency">$</span>
              <strong>400</strong>
              <span className="bw-per">/ business / month</span>
            </div>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}Includes the $50 workspace plan</li>
              <li>{CHECK_ICON}Our team calls your referrals</li>
              <li>{CHECK_ICON}Follow-up recorded in your workspace</li>
              <li>{CHECK_ICON}Calling hours confirmed during setup</li>
            </ul>
            <Link className="bw-btn bw-btn-primary bw-btn-block" href="/signup?plan=managed-calling">Choose Managed Calling</Link>
          </article>
        </div>
        <p className="bw-price-fine">Each issued card link can also be copied or displayed as a QR code. A compatible phone can open the form without installing an app.</p>
      </section>

      <section className="bw-section bw-section-alt" aria-label="What setup involves">
        <div className="bw-section-head">
          <p className="eyebrow">WHAT SETUP INVOLVES</p>
          <h2>Four steps from signup to your first referral.</h2>
        </div>
        <div className="bw-flow" aria-label="Setup steps">
          <div className="bw-flow-step"><span className="bw-flow-num">01</span><p>Create your workspace and subscription.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">02</span><p>Add receiving offices and referring partners.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">03</span><p>Arrange card links with Bridgewayrefer.</p></div>
          <span className="bw-flow-arrow" aria-hidden="true">→</span>
          <div className="bw-flow-step"><span className="bw-flow-num">04</span><p>Test a link and staff alerts, then enable intake.</p></div>
        </div>
      </section>

      <section className="bw-section" aria-label="NFC cards and billing">
        <div className="bw-two-col">
          <div>
            <p className="eyebrow">NFC CARDS</p>
            <h2>NFC cards are sold separately.</h2>
            <p>Request a card quote before purchasing. Confirm the quantity, card design, shipping cost, delivery estimate, and replacement terms with Bridgewayrefer. These costs are not included in the subscription.</p>
          </div>
          <div>
            <p className="eyebrow">BILLING</p>
            <h2>Manage your subscription in the workspace.</h2>
            <p>Manage subscription cancellation through Billing in your workspace. Any trial offer will be shown in checkout; no trial is promised on this page.</p>
            <p>New workspaces begin with intake off. Physical card issuance is managed by Bridgewayrefer.</p>
          </div>
        </div>
        <Link className="bw-btn bw-btn-secondary" href="/contact">Ask about cards and setup</Link>
      </section>
    </main>
  );
}

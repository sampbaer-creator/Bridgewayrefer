import { planCopy } from "../../lib/plan-copy";
import Link from "next/link";

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const metadata = { title: "Referral Tracking Software Pricing", description: "Compare BridgeWay referral tracking software pricing for Workspace, Managed Calling, and custom plans.", alternates: { canonical: "/pricing" } };

export default function PricingPage() {
  return (
    <main className="bw-page bw-pricing-page" id="main-content">
      <section className="bw-page-hero">
        <p className="eyebrow">PRICING</p>
        <h1>Referral tracking software pricing</h1>
        <p className="bw-page-sub">Compare monthly referral tracking plans. Ask BridgeWay for a quote for your locations and physical NFC cards.</p>
      </section>

      <section className="bw-section" aria-label="Monthly plans">
        <div className="bw-pricing-grid">
          <article className="bw-plan-card">
            <h3>{planCopy.workspace.name}</h3>
            <div className="bw-plan-price">
              <span className="bw-currency">$</span>
              <strong>{planCopy.workspace.fromUsd}</strong>
              <span className="bw-per">/ month and up</span>
            </div>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}Manage multiple locations</li>
              <li>{CHECK_ICON}NFC card and QR link management</li>
              <li>{CHECK_ICON}Referral tracking</li>
              <li>{CHECK_ICON}Unlimited partners</li>
              <li>{CHECK_ICON}Staff invitations</li>
              <li>{CHECK_ICON}Monthly reporting</li>
            </ul>
            <Link className="bw-btn bw-btn-primary bw-btn-block" href="/signup?plan=workspace">Get started</Link>
          </article>
          <article className="bw-plan-card">
            <h3>{planCopy.managedCalling.name}</h3>
            <div className="bw-plan-price">
              <span className="bw-currency">$</span>
              <strong>{planCopy.managedCalling.fromUsd}</strong>
              <span className="bw-per">/ month and up</span>
            </div>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}Includes Referral Workspace</li>
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
              <li>{CHECK_ICON}Card routing by location</li>
            </ul>
            <Link className="bw-btn bw-btn-primary bw-btn-block" href="/contact">Request a custom quote</Link>
          </article>
        </div>
        <p className="bw-price-fine">{planCopy.billing} Every card link also works as a QR code.</p>
        <p className="bw-price-fine">Compare <Link href="/referral-management-software">referral management software</Link> and <Link href="/referral-tracking-software">referral tracking software</Link> workflows.</p>
      </section>

      <section className="bw-section bw-section-alt bw-setup-section" aria-label="What setup involves">
        <div className="bw-section-head">
          <p className="eyebrow">WHAT SETUP INVOLVES</p>
          <h2>Four steps to your first referral.</h2>
        </div>
        <ol className="bw-setup-steps" aria-label="Setup steps">
          <li className="bw-flow-step"><span className="bw-flow-num" aria-hidden="true">01</span><h3>Choose a plan</h3><p>Sign up and subscribe.</p></li>
          <li className="bw-flow-step"><span className="bw-flow-num" aria-hidden="true">02</span><h3>Set up your workspace</h3><p>Add your locations and referring partners.</p></li>
          <li className="bw-flow-step"><span className="bw-flow-num" aria-hidden="true">03</span><h3>Request your cards</h3><p>Assign each NFC card to a partner and location.</p></li>
          <li className="bw-flow-step"><span className="bw-flow-num" aria-hidden="true">04</span><h3>Test and go live</h3><p>Test a card and confirm your team receives alerts.</p></li>
        </ol>
      </section>

      <section className="bw-section" aria-label="NFC cards and billing">
        <div className="bw-two-col">
          <div>
            <p className="eyebrow">NFC CARDS</p>
            <h2>NFC cards for your partners.</h2>
            <p>{planCopy.cards}</p>
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

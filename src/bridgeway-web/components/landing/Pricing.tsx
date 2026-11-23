import { planCopy } from "../../lib/plan-copy";
import Link from "next/link";
import { CHECK_ICON } from "./content";

export default function Pricing() {
  return (
      <section className="bw-pricing" id="pricing">
        <div className="bw-section-head reveal">
          <p className="bw-eyebrow">Pricing</p>
          <h2>
            Simple plans, <span className="bw-accent">no per-referral fees.</span>
          </h2>
          <p className="bw-section-sub">
            Every plan includes unlimited referrals and partners. {planCopy.billing}
          </p>
        </div>
        <div className="bw-pricing-grid">
          <article className="bw-plan-card bw-plan-featured reveal">
            <div className="bw-plan-badge">Most popular</div>
            <h3>{planCopy.workspace.name}</h3>
            <div className="bw-plan-price">
              <span className="bw-currency">$</span>
              <strong>{planCopy.workspace.fromUsd}</strong>
              <span className="bw-per">/ month and up</span>
            </div>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}Unlimited referrals</li>
              <li>{CHECK_ICON}Unlimited partners</li>
              <li>{CHECK_ICON}Branded referral forms</li>
              <li>{CHECK_ICON}NFC card and QR link management</li>
              <li>{CHECK_ICON}Staff invites & alerts</li>
              <li>{CHECK_ICON}Monthly reports</li>
            </ul>
            <Link className="bw-btn bw-btn-primary bw-btn-block" href="/signup?plan=workspace">
              Get started <span aria-hidden="true">→</span>
            </Link>
            <p className="bw-plan-note">
              {planCopy.cards} <Link href="/pricing">See pricing details</Link>.
            </p>
          </article>
          <article className="bw-plan-card reveal">
            <div className="bw-plan-badge bw-plan-badge-alt">Hands-off</div>
            <h3>{planCopy.managedCalling.name}</h3>
            <div className="bw-plan-price">
              <span className="bw-currency">$</span>
              <strong>{planCopy.managedCalling.fromUsd}</strong>
              <span className="bw-per">/ month and up</span>
            </div>
            <p className="bw-plan-qualifier">
              We call your referrals for you. Includes the full Referral Workspace.
            </p>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}Everything in Referral Workspace</li>
              <li>{CHECK_ICON}Our team calls your referrals</li>
              <li>{CHECK_ICON}Follow-up recorded in your workspace</li>
            </ul>
            <Link className="bw-btn bw-btn-secondary bw-btn-block" href="/contact?plan=managed-calling">
              Request a Managed Calling demo <span aria-hidden="true">→</span>
            </Link>
            <p className="bw-plan-note">We confirm calling hours during setup.</p>
          </article>
          <article className="bw-plan-card reveal">
            <div className="bw-plan-badge bw-plan-badge-alt">Large teams</div>
            <h3>Custom</h3>
            <div className="bw-plan-price">
              <strong>Let&rsquo;s talk</strong>
            </div>
            <p className="bw-plan-qualifier">
              For corporate groups and practices with many locations.
            </p>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}Volume pricing across locations</li>
              <li>{CHECK_ICON}Guided setup and onboarding</li>
              <li>{CHECK_ICON}Card routing by location</li>
            </ul>
            <Link className="bw-btn bw-btn-secondary bw-btn-block" href="/contact">
              Request a custom quote <span aria-hidden="true">→</span>
            </Link>
            <p className="bw-plan-note">We reply within one business day.</p>
          </article>
        </div>
      </section>
  );
}

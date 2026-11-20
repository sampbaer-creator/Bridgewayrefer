import { planCopy } from "../../lib/plan-copy";
import Link from "next/link";
import HeroScene from "../HeroScene";
import { CHECK_ICON } from "./content";

export default function Hero() {
  return (
      <section className="bw-hero">
        <div className="bw-hero-inner">
          <div className="bw-hero-copy">
            <p className="bw-eyebrow">NFC referral cards and tracking</p>
            <h1>
              Most partner referrals never get followed&nbsp;up. <span className="bw-accent">Yours will.</span>
            </h1>
            <p className="bw-hero-sub">
              Built for local practices and service businesses: your partners hand out a branded NFC card, customers tap
              to refer in seconds, and your team sees every referral and follow-up in one place — so none slip through.
            </p>
            <div className="bw-hero-actions">
              <Link className="bw-btn bw-btn-primary" href="/signup?plan=workspace">
                Get started <span aria-hidden="true">→</span>
              </Link>
              <a className="bw-btn bw-btn-ghost" href="#how-it-works">
                See how it works
              </a>
            </div>
            <ul className="bw-trust-row" aria-label="Product facts">
              <li>
                {CHECK_ICON}No app for customers
              </li>
              <li>
                {CHECK_ICON}Works on any phone
              </li>
              <li>
                {CHECK_ICON}Cancel anytime
              </li>
            </ul>
            <p className="bw-price-note">
              From <strong>${planCopy.workspace.fromUsd}/month</strong>.{" "}
              <Link href="/pricing">See pricing</Link>.
            </p>
          </div>

          <div className="bw-hero-visual">
            <HeroScene />
            <p className="bw-mockup-caption">Tap the card to open your referral form.</p>
          </div>
        </div>
      </section>
  );
}

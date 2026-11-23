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
              Referral tracking from the first tap to follow-up.
            </h1>
            <p className="bw-hero-sub">
              BridgeWay referral tracking helps practices and service businesses capture referrals with branded NFC cards and QR links, record the referral source, and follow up in one inbox.
            </p>
            <div className="bw-hero-actions">
              <Link className="bw-btn bw-btn-primary" href="/contact">
                See where referrals go missing <span aria-hidden="true">→</span>
              </Link>
              <a className="bw-btn bw-btn-ghost" href="/how-it-works">
                See how it works
              </a>
            </div>
            <ul className="bw-trust-row" aria-label="Product facts">
              <li>
                {CHECK_ICON}No app for customers
              </li>
              <li>
                {CHECK_ICON}QR option for phones with a camera
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

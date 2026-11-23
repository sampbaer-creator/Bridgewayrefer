import { planCopy } from "../../lib/plan-copy";
import Link from "next/link";
import HeroScene from "../HeroScene";
import { CHECK_ICON } from "./content";

export default function Hero() {
  return (
      <section className="bw-hero">
        <div className="bw-hero-inner">
          <div className="bw-hero-copy">
            <p className="bw-eyebrow">Referral tracking software</p>
            <h1>
              Track every referral from tap to follow-up.
            </h1>
            <p className="bw-hero-sub">
              Referral tracking software helps practices and service businesses capture introductions, record who sent them, and organize follow-up in one inbox. Partners can share a branded NFC card or QR link.
            </p>
            <div className="bw-hero-actions">
              <Link className="bw-btn bw-btn-primary" href="/signup?plan=workspace">
                Get started
              </Link>
              <a className="bw-btn bw-btn-ghost" href="/how-it-works">
                See how it works
              </a>
            </div>
            <p className="bw-price-note">
              Need a team referral pipeline? <Link href="/referral-management-software">Explore referral management software</Link>.
            </p>
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

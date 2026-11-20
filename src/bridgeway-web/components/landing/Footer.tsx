import { planCopy } from "../../lib/plan-copy";
import Link from "next/link";

export default function Footer() {
  return (
    <>
      {/* ============ FOOTER ============ */}
      <footer className="bw-footer">
        <div className="bw-footer-inner">
          <Link className="bw-brand bw-brand-footer" href="/" aria-label="BridgeWayRefer home">
            <img className="bw-brand-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={105} height={36} />
          </Link>
          <p className="bw-footer-tag">Referrals, followed through.</p>
          <nav className="bw-footer-nav" aria-label="Footer">
            <Link href="/pricing">Pricing</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/security">Security</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <button type="button" className="footer-cookie-settings" data-cookie-settings>Cookie settings</button>
          </nav>
          <p className="bw-footer-fine">© {new Date().getFullYear()} BridgeWay · Built for healthcare and home service teams.</p>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="bw-sticky-cta" id="sticky-cta">
        <div className="bw-sticky-copy">
          <strong>From ${planCopy.workspace.fromUsd}/mo</strong>
        </div>
        <Link className="bw-btn bw-btn-primary" href="/signup?plan=workspace">
          Get started
        </Link>
      </div>
    </>
  );
}


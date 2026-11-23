import Link from "next/link";
import { PIPE_STEPS } from "../../components/landing/content";

export const metadata = {
  title: "Tap-to-Refer with NFC Cards and QR Links",
  description: "See how a BridgeWay NFC card or QR link captures a referral and helps your team follow up.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <main className="bw-landing bw-how-it-works" id="main-content">
      <section className="bw-journey" id="how-it-works" aria-labelledby="referral-journey">
        <div className="bw-journey-inner">
          <p className="bw-eyebrow bw-eyebrow-light">How a referral travels</p>
          <h1 id="referral-journey">
            Tap-to-refer, from card to follow-up<span className="bw-accent-light">.</span>
          </h1>
          <p className="bw-journey-sub">
            With tap-to-refer, every submitted request records who sent it and which office receives it.
          </p>

          <div className="bw-pipeline">
            <div className="bw-pipeline-track" aria-hidden="true">
              <span className="bw-pipeline-pulse" />
            </div>
            <ol className="bw-pipeline-steps">
              {PIPE_STEPS.map((step, index) => (
                <li className="bw-pipe-step" key={step.title}>
                  <span className="bw-pipe-icon">{step.icon}</span>
                  <b>{step.title}</b>
                  <p>{step.copy}</p>
                  <span className="bw-step-num" aria-hidden="true">
                    0{index + 1}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <p className="bw-journey-sub">In Analytics, compare submitted forms with card-link opens. Opens include NFC taps, QR scans and shared links.</p>
          <div className="bw-journey-actions">
            <Link className="bw-btn bw-btn-primary" href="/pricing">See pricing</Link>
            <Link className="bw-btn bw-btn-ghost" href="/contact">Request a walkthrough</Link>
          </div>
        </div>
      </section>    </main>
  );
}

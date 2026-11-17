import Link from "next/link";
import { FEATURES, PIPE_STEPS } from "./content";

export default function Story() {
  return (
    <>
      {/* ============ PROOF STRIP ============ */}
      <section className="bw-proof" aria-label="Product facts">
        <div className="bw-proof-inner">
          <div className="bw-proof-item reveal">
            <strong>
              <span className="count" data-count="3" data-suffix=" steps">
                3 steps
              </span>
            </strong>
            <span>Tap to assigned follow-up</span>
          </div>
          <div className="bw-proof-item reveal">
            <strong>
              <span className="count" data-count="12" data-suffix=" months">
                12 months
              </span>
            </strong>
            <span>Trends in every report</span>
          </div>
          <div className="bw-proof-item reveal">
            <strong>
              <span className="count" data-count="0" data-suffix=" apps">
                No apps
              </span>
            </strong>
            <span>Customers use the browser</span>
          </div>
          <div className="bw-proof-item reveal">
            <strong>
              <span className="count" data-count="50" data-prefix="$" data-suffix="/mo">
                $50/mo
              </span>
            </strong>
            <span>Per location. Unlimited partners.</span>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS (dark band) ============ */}
      <section className="bw-journey" id="how-it-works">
        <div className="bw-journey-inner">
          <p className="bw-eyebrow bw-eyebrow-light">How a referral travels</p>
          <h2>
            From a tap to a booked job<span className="bw-accent-light">.</span>
          </h2>
          <p className="bw-journey-sub">
            Every referral records who sent it and which office receives it.
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
        </div>
      </section>

      {/* ============ INDUSTRIES ============ */}
      <section className="bw-industries" id="industries">
        <div className="bw-section-head reveal">
          <p className="bw-eyebrow">Tuned to your business</p>
          <h2>
            One workflow, <span className="bw-accent">two industries.</span>
          </h2>
        </div>
        <div className="bw-industry-grid">
          <Link className="bw-industry-card reveal" href="/industries/healthcare">
            <span className="bw-industry-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 2v2" />
                <path d="M5 2v2" />
                <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
                <path d="M8 15a6 6 0 0 0 12 0v-3" />
                <circle cx="20" cy="10" r="2" />
              </svg>
            </span>
            <h3>Healthcare</h3>
            <p>
              A healthcare provider refers a patient to a medical or dental specialist. The receiving practice sees who sent the referral and who is
              following up.
            </p>
            <span className="bw-industry-link">Explore healthcare referrals →</span>
          </Link>
          <Link className="bw-industry-card reveal" href="/industries/trades">
            <span className="bw-industry-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </span>
            <h3>Home service trades</h3>
            <p>
              A plumber introduces a homeowner to an HVAC company. The receiving team sees who made the introduction and
              tracks it to a booked job.
            </p>
            <span className="bw-industry-link">Explore trades referrals →</span>
          </Link>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section className="bw-features" id="features">
        <div className="bw-section-head reveal">
          <p className="bw-eyebrow">What you get</p>
          <h2>
            Everything you need to track referrals<span className="bw-accent">.</span>
          </h2>
        </div>
        <div className="bw-feature-grid">
          {FEATURES.map((feature) => (
            <article className="bw-feature-card reveal" key={feature.title}>
              <span className="bw-feature-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ============ EXAMPLE ============ */}
      <section className="bw-example" aria-labelledby="bw-example-heading">
        <div className="bw-example-card reveal">
          <div className="bw-example-copy">
            <p className="bw-eyebrow">The referral math</p>
            <h2 id="bw-example-heading">
              Where referrals leak<span className="bw-accent">.</span>
            </h2>
            <p>
              A partner sends you a warm introduction. It lands on a sticky note or in a shared inbox. Nobody owns it, so
              nobody follows up.
            </p>
            <p className="bw-example-kicker">
              BridgeWay gives every referral an owner and a status, from first tap to booked job.
            </p>
            <span className="bw-example-tag">Illustrative example</span>
          </div>
          <div className="bw-example-flow" aria-hidden="true">
            <div className="bw-flow-card bw-flow-card-bad">
              <span className="bw-flow-label">Without BridgeWay</span>
              <ul>
                <li>
                  <span />Referral on a sticky note
                </li>
                <li>
                  <span />No record of who sent it
                </li>
                <li>
                  <span />Follow-up depends on memory
                </li>
                <li>
                  <span />Partner never knows the outcome
                </li>
              </ul>
            </div>
            <div className="bw-flow-card bw-flow-card-good">
              <span className="bw-flow-label">With BridgeWay</span>
              <ul>
                <li>
                  <span />Tap captured with partner attached
                </li>
                <li>
                  <span />Alert routed to the right staff
                </li>
                <li>
                  <span />Status tracked to a booked job
                </li>
                <li>
                  <span />Partner credited in the monthly report
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ============ MARQUEE ============ */}
      <div className="bw-marquee" aria-hidden="true">
        <div className="bw-marquee-track">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i}>
              Tap → Scan → Refer → Follow up → Book the job → Tap → Scan → Refer → Follow up → Book the job → Tap →
              Scan → Refer → Follow up → Book the job → Tap → Scan → Refer → Follow up → Book the job → Tap → Scan →
              Refer → Follow up → Book the job → Tap → Scan → Refer → Follow up → Book the job → Tap → Scan → Refer →
              Follow up → Book the job →&nbsp;
            </span>
          ))}
        </div>
      </div>
    </>
  );
}


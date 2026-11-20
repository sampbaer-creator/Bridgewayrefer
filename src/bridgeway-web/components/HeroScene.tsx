"use client";

import { Stage, Phone, type Act } from "./stageshow";

// The BridgeWay hero: a partner's customer taps an NFC card, the referral
// form fills, the request sends, and the practice's notification lands.
// The first and reduced-motion frames show the referral form.

type S = {
  name: string;
  phone: string;
  sent: boolean;
  chip: boolean;
};

const INITIAL: S = { name: "", phone: "", sent: false, chip: false };

const REST = { wide: { x: 96, y: 448 }, compact: { x: 180, y: 430 } };

async function script(a: Act<S>) {
  await a.wait(1100);

  // The tap on the NFC card opens the form
  await a.move("card");
  await a.wait(260);
  await a.click("card");
  await a.wait(620);

  // The customer fills the form
  await a.move("field-name");
  await a.wait(180);
  await a.click("field-name");
  await a.type("name", "Maya Chen");
  await a.wait(280);
  await a.move("field-phone");
  await a.wait(180);
  await a.click("field-phone");
  await a.type("phone", "(555) 210-4477");
  await a.wait(340);

  // Send
  await a.move("send");
  await a.wait(200);
  await a.click("send");
  a.put({ sent: true });
  await a.wait(560);

  // The practice is notified — the payoff
  a.put({ chip: true });
  a.mark("payoff");
  await a.wait(2100);

  // Dismiss the notification and return to the empty referral form
  await a.move("chip");
  await a.wait(200);
  await a.click("chip");
  a.put({ chip: false });
  await a.wait(420);
  await a.move("close");
  await a.wait(200);
  await a.click("close");
  await a.snap({ name: "", phone: "", sent: false });
  await a.move(REST);
  await a.wait(420);
}

export default function HeroScene() {
  return (
    <Stage<S>
      className="bw-look"
      width={560}
      height={500}
      compact={{ below: 430, width: 358, height: 470 }}
      initial={INITIAL}
      poster={INITIAL}
      script={script}
      cursor={{ at: REST, style: "touch", ripple: true, idle: false }}
      theme="light"
      greys="cool"
      tokens={{
        "--ss-canvas": "transparent",
        "--ss-accent": "#48B2E6",
        "--ss-accent-2": "#7BC8ED",
        "--ss-accent-text": "#0D2339",
        "--ss-text-strong": "#0D2339",
        "--ss-text": "#324D59",
        "--ss-text-faint": "#4A6577",
        "--ss-line": "#C2CED8",
        "--ss-font": "var(--font-body), Georgia, serif",
        "--ss-radius-md": "8px",
        "--ss-radius-lg": "16px",
      }}
    >
      {(s, rect, layout) => {
        const compact = layout === "compact";
        return (
          <>
            <Phone
              width={compact ? 240 : 272}
              frame="silver"
              className="bwsc-phone"
              time="9:41"
            >
              <div className="bwsc-screen" data-active={s.name || s.sent || undefined}>
                <div className="bwsc-form">
                  <span className="bwsc-kicker">Referral form</span>
                  <strong className="bwsc-title">Request a follow-up</strong>

                  <label className="bwsc-field" data-target="field-name">
                    <span className="bwsc-label">Your name</span>
                    <span className="bwsc-input">
                      {s.name ? s.name : <span className="bwsc-placeholder">Tap to type</span>}
                    </span>
                  </label>

                  <label className="bwsc-field" data-target="field-phone">
                    <span className="bwsc-label">Email or phone</span>
                    <span className="bwsc-input">
                      {s.phone ? s.phone : <span className="bwsc-placeholder">Tap to type</span>}
                    </span>
                  </label>

                  <span
                    className="bwsc-send"
                    data-target="send"
                    data-sent={s.sent || undefined}
                    aria-hidden="true"
                  >
                    <span className="bwsc-send-label" data-state="idle">
                      Send referral
                      <span aria-hidden="true">→</span>
                    </span>
                    <span className="bwsc-send-label" data-state="sent">
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Referral sent
                    </span>
                  </span>

                  <span
                    className="bwsc-close"
                    data-target="close"
                    data-visible={s.sent || undefined}
                  >
                    Start next referral
                  </span>
                </div>

                <div className="bwsc-recent">
                  <span className="bwsc-recent-label">Recent requests</span>
                  <div className="bwsc-recent-row">
                    <span className="bwsc-recent-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="12" height="12">
                        <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="bwsc-recent-text">
                      <b>Diego Alvarez</b>
                      <small>Followed up · booked</small>
                    </span>
                  </div>
                </div>
              </div>
            </Phone>

            {/* NFC card — the satellite straddling the phone's edge */}
            <div className="bwsc-card" data-target="card">
              <div className="bwsc-card-top">
                <span className="bwsc-card-brand">BridgeWay</span>
                <svg className="bwsc-waves" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 8.32a7.5 7.5 0 0 1 0 7.36" />
                  <path d="M9.5 10.43a4 4 0 0 1 0 3.14" />
                  <path d="M12.99 12.12a.75.75 0 0 0 0-.24" />
                  <path d="M17 4.77a11 11 0 0 1 0 14.46" />
                </svg>
              </div>
              <span className="bwsc-card-label">Tap to refer</span>
            </div>

            {/* The practice's notification */}
            <div className="bwsc-chip" data-target="chip" data-show={s.chip || undefined}>
              <span className="bwsc-chip-dot" />
              <span className="bwsc-chip-copy">
                <b>New referral received</b>
                <small>From Saratoga Springs Ortho · just now</small>
              </span>
            </div>
          </>
        );
      }}
    </Stage>
  );
}

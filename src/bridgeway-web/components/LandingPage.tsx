"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../lib/api";


const PIPE_STEPS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </svg>
    ),
    title: "Your partner shares the card",
    copy: "A dentist, plumber, or partner office hands the customer your branded NFC card or QR link.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect width="14" height="20" x="5" y="2" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
    title: "The customer taps and fills a short form",
    copy: "No app to install — the form opens in the browser with the partner already attached.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    ),
    title: "Your team assigns and follows up",
    copy: "Alerts route the referral to the right staff member, and you track it through to a scheduled visit or booked job.",
  },
];

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect width="5" height="5" x="3" y="3" rx="1" />
        <rect width="5" height="5" x="16" y="3" rx="1" />
        <rect width="5" height="5" x="3" y="16" rx="1" />
        <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
        <path d="M21 21v.01" />
        <path d="M12 7v3a2 2 0 0 1-2 2H7" />
        <path d="M3 12h.01" />
        <path d="M12 3h.01" />
        <path d="M12 16v.01" />
        <path d="M16 12h1" />
        <path d="M21 12v.01" />
        <path d="M12 21v-1" />
      </svg>
    ),
    title: "Branded referral form",
    copy: "Your logo and offices on every card link. Partners share something that looks like you, not a generic form.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Partner tracking",
    copy: "Compare link opens and referrals for each partner and office, so your strongest relationships get the credit.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
    title: "Staff alerts",
    copy: "Configure email alerts that link your team straight to the dashboard the moment a referral lands.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    ),
    title: "Monthly reports",
    copy: "12-month trends and month-over-month comparisons, delivered to your workspace every month.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
        <path d="M10 18h4" />
      </svg>
    ),
    title: "Team access",
    copy: "Invite staff to your private workspace with roles that match how your office actually works.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    title: "Secure by default",
    copy: "Workspace membership controls access to referral records. Your data stays in your business, full stop.",
  },
];

const FAQS = [
  ["How do NFC cards work?", "Tap the card with a compatible phone to open the receiving business's branded referral form. QR links do the same for any camera."],
  ["Do customers need an app?", "No. The referral form opens in the phone's web browser — nothing to download, nothing to sign up for."],
  ["Who can see our referrals?", "Only authorized members of your business workspace can access its private referral dashboard."],
  ["Can I cancel anytime?", "Manage your subscription and cancellation from Billing in your workspace. No lock-in, no exit fees."],
  ["How do I add more offices?", "Add offices from Setup in your workspace, then issue card links for the correct office. Unlimited offices on every plan."],
];

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

type FormState = "idle" | "busy" | "done" | "error";

export default function LandingPage() {
  const root = useRef<HTMLElement>(null);
  const [demoState, setDemoState] = useState<FormState>("idle");
  const [demoError, setDemoError] = useState("");
  const [listState, setListState] = useState<FormState>("idle");
  const [listError, setListError] = useState("");
  const submissionId = useRef<string>("");

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---- Scroll reveals ---- */
    const revealEls = el.querySelectorAll<HTMLElement>(".reveal");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const target = entry.target as HTMLElement;
            const siblings = Array.prototype.indexOf.call(
              (target.parentElement as HTMLElement).querySelectorAll(":scope > .reveal"),
              target
            );
            target.style.transitionDelay = `${Math.max(0, siblings) * 70}ms`;
            target.classList.add("in");
            io.unobserve(target);
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
      );
      revealEls.forEach((node) => io.observe(node));
      return () => io.disconnect();
    }
    revealEls.forEach((node) => node.classList.add("in"));
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---- Hero mockup loop ---- */
    const ripple = el.querySelector<HTMLElement>("#tap-ripple");
    const chip = el.querySelector<HTMLElement>("#referral-chip");
    const fields = el.querySelectorAll<HTMLElement>(".field-fake");
    if (reducedMotion) {
      fields.forEach((f) => f.classList.add("filled"));
      chip?.classList.add("show");
    } else {
      let heroTimer: ReturnType<typeof setTimeout>;
      const heroLoop = () => {
        ripple?.classList.remove("pulsing");
        chip?.classList.remove("show");
        fields.forEach((f) => f.classList.remove("filled"));
        if (ripple) void ripple.offsetWidth;
        ripple?.classList.add("pulsing");
        heroTimer = setTimeout(() => fields[0]?.classList.add("filled"), 700);
        heroTimer = setTimeout(() => fields[1]?.classList.add("filled"), 1200);
        heroTimer = setTimeout(() => chip?.classList.add("show"), 1900);
        heroTimer = setTimeout(() => chip?.classList.remove("show"), 4200);
      };
      heroLoop();
      const heroInterval = setInterval(heroLoop, 6400);
      return () => {
        clearTimeout(heroTimer);
        clearInterval(heroInterval);
      };
    }
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---- Pipeline step lighting ---- */
    const steps = el.querySelectorAll<HTMLElement>(".pipe-step");
    if (reducedMotion) {
      steps.forEach((s) => s.classList.add("lit"));
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const lightSteps = () => {
      steps.forEach((s) => s.classList.remove("lit"));
      steps[0]?.classList.add("lit");
      timers = [
        setTimeout(() => steps[1]?.classList.add("lit"), 1900),
        setTimeout(() => steps[2]?.classList.add("lit"), 3900),
        setTimeout(() => steps.forEach((s) => s.classList.remove("lit")), 5900),
      ];
    };
    lightSteps();
    const interval = setInterval(lightSteps, 6000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---- Counters ---- */
    const counters = el.querySelectorAll<HTMLElement>(".count[data-count]");
    const animate = (node: HTMLElement) => {
      const target = parseInt(node.dataset.count || "0", 10) || 0;
      const prefix = node.dataset.prefix || "";
      const suffix = node.dataset.suffix || "";
      if (reducedMotion || target === 0) {
        node.textContent = `${prefix}${target}${suffix}`;
        return;
      }
      let start: number | null = null;
      const tick = (ts: number) => {
        if (start === null) start = ts;
        const p = Math.min((ts - start) / 1100, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = `${prefix}${Math.round(eased * target)}${suffix}`;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              animate(entry.target as HTMLElement);
              io.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.6 }
      );
      counters.forEach((node) => io.observe(node));
      return () => io.disconnect();
    }
    counters.forEach(animate);
  }, []);

  useEffect(() => {
    const el = root.current;
    const sticky = el?.querySelector<HTMLElement>("#sticky-cta");
    const hero = el?.querySelector<HTMLElement>(".hero");
    if (!sticky || !hero) return;
    const onScroll = () => {
      const past = window.scrollY > hero.offsetHeight - 120;
      const nearBottom = window.innerHeight + window.scrollY > document.body.offsetHeight - 420;
      sticky.classList.toggle("visible", past && !nearBottom);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function sendDemoRequest(values: {
    name: string;
    email: string;
    businessName: string;
    consent: boolean;
    interest?: string;
  }) {
    submissionId.current ||= crypto.randomUUID();
    await api("/api/demo-requests", {
      method: "POST",
      body: JSON.stringify({
        name: values.name,
        email: values.email,
        businessName: values.businessName,
        consent: values.consent,
        submissionId: submissionId.current,
        ...(values.interest ? { interest: values.interest } : {}),
      }),
    });
  }

  async function submitDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setDemoState("busy");
    setDemoError("");
    try {
      await sendDemoRequest({
        name: String(values.get("name") || ""),
        email: String(values.get("email") || ""),
        businessName: String(values.get("businessName") || ""),
        consent: values.get("consent") === "on",
      });
      setDemoState("done");
    } catch (failure) {
      setDemoState("error");
      setDemoError(failure instanceof Error ? failure.message : "Could not send your request. Please try again.");
    }
  }

  async function submitChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setListState("busy");
    setListError("");
    try {
      await sendDemoRequest({
        name: String(values.get("name") || ""),
        email: String(values.get("email") || ""),
        businessName: "Referral follow-up checklist request",
        consent: values.get("consent") === "on",
      });
      setListState("done");
    } catch (failure) {
      setListState("error");
      setListError(failure instanceof Error ? failure.message : "Could not send your request. Please try again.");
    }
  }

  return (
    <main className="bw-landing" id="main-content" ref={root}>
      <header className="bw-header">
        <div className="bw-header-inner">
          <Link className="bw-brand" href="/" aria-label="BridgeWay home">
            <img className="bw-brand-mark" src="/brand-mark.png" alt="" width={34} height={34} />
            <span className="bw-brand-name">
              Bridge<span className="bw-brand-accent">Way</span>
            </span>
          </Link>
          <nav className="bw-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <Link href="/industries/dental">Dental</Link>
            <Link href="/industries/trades">Trades</Link>
            <Link href="/pricing">Pricing</Link>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="bw-header-actions">
            <Link className="bw-signin" href="/staff/login">
              Sign in
            </Link>
            <a className="bw-btn bw-btn-primary bw-btn-sm" href="#walkthrough">
              Request a walkthrough
            </a>
          </div>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section className="bw-hero">
        <div className="bw-hero-inner">
          <div className="bw-hero-copy">
            <p className="bw-eyebrow">NFC referral cards + tracking</p>
            <h1>
              Most partner referrals never get followed&nbsp;up. <span className="bw-accent">Yours will.</span>
            </h1>
            <p className="bw-hero-sub">
              Give your partners a branded NFC card. Customers tap or scan to open a short form, and your team sees who sent
              each referral and what needs follow-up — from first contact to a booked job.
            </p>
            <div className="bw-hero-actions">
              <a className="bw-btn bw-btn-primary" href="#walkthrough">
                Request a walkthrough <span aria-hidden="true">→</span>
              </a>
              <a className="bw-btn bw-btn-ghost" href="#how-it-works">
                See how it works
              </a>
            </div>
            <ul className="bw-trust-row" aria-label="Product facts">
              <li>
                {CHECK_ICON}No app for customers
              </li>
              <li>
                {CHECK_ICON}Works on any modern phone
              </li>
              <li>
                {CHECK_ICON}Cancel anytime
              </li>
            </ul>
            <p className="bw-price-note">
              Plans from <strong>$50</strong> per business, per month · NFC cards sold separately.{" "}
              <Link href="/pricing">See details</Link>.
            </p>
          </div>

          <div className="bw-hero-visual" aria-hidden="true">
            <figure className="bw-mockup">
              <div className="bw-tap-card">
                <div className="bw-tap-card-top">
                  <span className="bw-tap-card-brand">BridgeWay</span>
                  <svg className="bw-nfc-waves" viewBox="0 0 24 24">
                    <path d="M6 8.32a7.5 7.5 0 0 1 0 7.36" />
                    <path d="M9.5 10.43a4 4 0 0 1 0 3.14" />
                    <path d="M12.99 12.12a.75.75 0 0 0 0-.24" />
                    <path d="M17 4.77a11 11 0 0 1 0 14.46" />
                  </svg>
                </div>
                <span className="bw-tap-card-label">Tap to refer</span>
                <span className="bw-tap-ripple" id="tap-ripple" />
              </div>
              <div className="bw-tap-phone">
                <div className="bw-phone-notch" />
                <small className="bw-phone-kicker">Referral form</small>
                <strong className="bw-phone-title">Request a follow-up</strong>
                <div className="bw-phone-field">
                  <span className="bw-field-label">Your name</span>
                  <span className="bw-field-fake" data-fill="1" />
                </div>
                <div className="bw-phone-field">
                  <span className="bw-field-label">Email or phone</span>
                  <span className="bw-field-fake" data-fill="2" />
                </div>
                <button className="bw-phone-btn" type="button" tabIndex={-1}>
                  Send referral <span>→</span>
                </button>
              </div>
              <div className="bw-referral-chip" id="referral-chip">
                <span className="bw-chip-dot" />
                <div className="bw-chip-copy">
                  <b>New referral received</b>
                  <small>From Saratoga Springs Ortho · just now</small>
                </div>
              </div>
            </figure>
            <p className="bw-mockup-caption">A branded card opens your referral form.</p>
          </div>
        </div>
      </section>

      {/* ============ PROOF STRIP ============ */}
      <section className="bw-proof" aria-label="Product facts">
        <div className="bw-proof-inner">
          <div className="bw-proof-item reveal">
            <strong>
              <span className="count" data-count="3" data-suffix=" steps">
                3 steps
              </span>
            </strong>
            <span>From tap to assigned follow-up</span>
          </div>
          <div className="bw-proof-item reveal">
            <strong>
              <span className="count" data-count="12" data-suffix=" months">
                12 months
              </span>
            </strong>
            <span>Referral trends in every report</span>
          </div>
          <div className="bw-proof-item reveal">
            <strong>
              <span className="count" data-count="0" data-suffix=" apps">
                No apps
              </span>
            </strong>
            <span>Customers use their phone&rsquo;s browser</span>
          </div>
          <div className="bw-proof-item reveal">
            <strong>
              <span className="count" data-count="50" data-prefix="$" data-suffix="/mo">
                $50/mo
              </span>
            </strong>
            <span>Flat per business. Unlimited partners.</span>
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
            Every referral carries the partner who sent it and the office that receives it — so nothing slips through.
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
            One referral workflow, <span className="bw-accent">two worlds.</span>
          </h2>
        </div>
        <div className="bw-industry-grid">
          <Link className="bw-industry-card reveal" href="/industries/dental">
            <span className="bw-industry-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 2v2" />
                <path d="M5 2v2" />
                <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
                <path d="M8 15a6 6 0 0 0 12 0v-3" />
                <circle cx="20" cy="10" r="2" />
              </svg>
            </span>
            <h3>Dental & orthodontics</h3>
            <p>
              A general dentist refers a patient to an orthodontist. The receiving practice sees which office sent the
              referral and who is following up — no more slips of paper lost at the front desk.
            </p>
            <span className="bw-industry-link">Explore dental referrals →</span>
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
              tracks it through to a booked job — with the partner credited every time.
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
              A partner hands you a warm introduction. It lands on a sticky note, an inbox, or a front desk. Nobody owns
              it, so nobody follows up — and the job goes to whoever answers the phone first.
            </p>
            <p className="bw-example-kicker">
              BridgeWay gives every referral an owner, a status, and a trail — from the first tap to the booked job.
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

      {/* ============ PRICING ============ */}
      <section className="bw-pricing" id="pricing">
        <div className="bw-section-head reveal">
          <p className="bw-eyebrow">Pricing</p>
          <h2>
            Simple plans, <span className="bw-accent">no per-referral fees.</span>
          </h2>
          <p className="bw-section-sub">
            Every plan includes unlimited referrals, offices, and partners. NFC cards are sold separately — see card and
            setup details during your walkthrough.
          </p>
        </div>
        <div className="bw-pricing-grid">
          <article className="bw-plan-card bw-plan-featured reveal">
            <div className="bw-plan-badge">Most popular</div>
            <h3>Referral Workspace</h3>
            <div className="bw-plan-price">
              <span className="bw-currency">$</span>
              <strong>50</strong>
              <span className="bw-per">/ business / month</span>
            </div>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}Unlimited referrals</li>
              <li>{CHECK_ICON}Unlimited offices & partners</li>
              <li>{CHECK_ICON}Branded referral forms</li>
              <li>{CHECK_ICON}Staff invites & alerts</li>
              <li>{CHECK_ICON}Monthly reports</li>
            </ul>
            <Link className="bw-btn bw-btn-primary bw-btn-block" href="/signup?plan=workspace">
              Start your workspace <span aria-hidden="true">→</span>
            </Link>
            <p className="bw-plan-note">
              NFC cards sold separately. <Link href="/pricing">See card and setup details</Link>.
            </p>
          </article>
          <article className="bw-plan-card reveal">
            <div className="bw-plan-badge bw-plan-badge-alt">Hands-off</div>
            <h3>Managed Calling</h3>
            <div className="bw-plan-price">
              <span className="bw-currency">$</span>
              <strong>400</strong>
              <span className="bw-per">total / business / month</span>
            </div>
            <p className="bw-plan-qualifier">
              For teams that want follow-up handled for them. Includes the full Referral Workspace.
            </p>
            <ul className="bw-plan-list">
              <li>{CHECK_ICON}Everything in Referral Workspace</li>
              <li>{CHECK_ICON}Our team calls your referrals</li>
              <li>{CHECK_ICON}Follow-up recorded in your workspace</li>
            </ul>
            <Link className="bw-btn bw-btn-secondary bw-btn-block" href="/signup?plan=managed-calling">
              Choose Managed Calling <span aria-hidden="true">→</span>
            </Link>
            <p className="bw-plan-note">We confirm calling hours and service details during setup.</p>
          </article>
        </div>
      </section>

      {/* ============ LEAD CAPTURE ============ */}
      <section className="bw-lead" id="walkthrough">
        <div className="bw-lead-card reveal">
          <div className="bw-lead-copy">
            <p className="bw-eyebrow bw-eyebrow-light">Two ways to start</p>
            <h2>
              Book a walkthrough, or steal our checklist<span className="bw-accent-light">.</span>
            </h2>
            <p className="bw-lead-sub">
              See the dashboard with your own referral workflow in 15 minutes — or grab the follow-up checklist dental
              and trades teams use to stop losing referrals.
            </p>
          </div>
          <div className="bw-lead-forms">
            {demoState === "done" ? (
              <p className="bw-lead-success" role="status">
                Thanks — we&rsquo;ll email you within one business day to set up your walkthrough.
              </p>
            ) : (
              <form className="bw-lead-form" onSubmit={submitDemo} noValidate>
                <label className="bw-sr-only" htmlFor="demo-name">
                  Your name
                </label>
                <input id="demo-name" name="name" type="text" placeholder="Your name" autoComplete="name" maxLength={120} required />
                <label className="bw-sr-only" htmlFor="demo-email">
                  Work email
                </label>
                <input id="demo-email" name="email" type="email" placeholder="Work email" autoComplete="email" maxLength={254} required />
                <label className="bw-sr-only" htmlFor="demo-business">
                  Practice or business
                </label>
                <input
                  id="demo-business"
                  name="businessName"
                  type="text"
                  placeholder="Practice or business"
                  autoComplete="organization"
                  maxLength={120}
                  required
                />
                <label className="bw-lead-consent">
                  <input name="consent" type="checkbox" required />
                  <span>I agree that BridgeWay may contact me about this request.</span>
                </label>
                <button className="bw-btn bw-btn-light bw-btn-block" type="submit" disabled={demoState === "busy"}>
                  {demoState === "busy" ? "Sending…" : "Request a walkthrough"} <span aria-hidden="true">→</span>
                </button>
                {demoState === "error" && (
                  <p className="bw-lead-error" role="alert">
                    {demoError}
                  </p>
                )}
                <p className="bw-lead-fine">A real person replies within one business day. No pressure.</p>
              </form>
            )}
            {listState === "done" ? (
              <p className="bw-lead-success" role="status">
                Check your inbox — the referral follow-up checklist is on its way.
              </p>
            ) : (
              <form className="bw-lead-form" onSubmit={submitChecklist} noValidate>
                <label className="bw-sr-only" htmlFor="list-name">
                  Your name
                </label>
                <input id="list-name" name="name" type="text" placeholder="Your name" autoComplete="name" maxLength={120} required />
                <label className="bw-sr-only" htmlFor="list-email">
                  Email for the checklist
                </label>
                <input
                  id="list-email"
                  name="email"
                  type="email"
                  placeholder="Email me the checklist"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
                <label className="bw-lead-consent">
                  <input name="consent" type="checkbox" required />
                  <span>One email with the checklist, nothing else.</span>
                </label>
                <button className="bw-btn bw-btn-ghost-light bw-btn-block" type="submit" disabled={listState === "busy"}>
                  {listState === "busy" ? "Sending…" : "Get the checklist"} <span aria-hidden="true">→</span>
                </button>
                {listState === "error" && (
                  <p className="bw-lead-error" role="alert">
                    {listError}
                  </p>
                )}
                <p className="bw-lead-fine">
                  The referral follow-up checklist for dental & trades teams. Free, one email.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="bw-faq" id="faq">
        <div className="bw-section-head reveal">
          <p className="bw-eyebrow">Questions</p>
          <h2>
            Frequently asked<span className="bw-accent">.</span>
          </h2>
        </div>
        <div className="bw-faq-list">
          {FAQS.map(([question, answer]) => (
            <details className="reveal" key={question}>
              <summary>
                {question}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="bw-final-cta">
        <h2 className="reveal">
          Make the next referral <span className="bw-accent-light">impossible to lose.</span>
        </h2>
        <a className="bw-btn bw-btn-light bw-btn-lg reveal" href="#walkthrough">
          Request a walkthrough <span aria-hidden="true">→</span>
        </a>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="bw-footer">
        <div className="bw-footer-inner">
          <Link className="bw-brand bw-brand-footer" href="/" aria-label="BridgeWay home">
            <img className="bw-brand-mark" src="/brand-mark.png" alt="" width={30} height={30} />
            <span className="bw-brand-name">
              Bridge<span className="bw-brand-accent-footer">Way</span>
            </span>
          </Link>
          <p className="bw-footer-tag">Referrals, followed through.</p>
          <nav className="bw-footer-nav" aria-label="Footer">
            <Link href="/pricing">Pricing</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/security">Security</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
          <p className="bw-footer-fine">© {new Date().getFullYear()} BridgeWay · Built for dental, orthodontic, and home service teams.</p>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="bw-sticky-cta" id="sticky-cta" aria-hidden="true">
        <div className="bw-sticky-copy">
          <strong>From $50/mo</strong>
          <small>Unlimited referrals & partners</small>
        </div>
        <a className="bw-btn bw-btn-primary" href="#walkthrough">
          Request a walkthrough
        </a>
      </div>
    </main>
  );
}

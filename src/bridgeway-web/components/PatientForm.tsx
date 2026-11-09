"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type PublicConfig } from "../lib/api";

export default function PatientForm({ config, code = "" }: { config: PublicConfig; code?: string }) {
  const [done, setDone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submissionId = useRef(""); const success = useRef<HTMLElement>(null);
  const openEvent = useRef({ code: "", id: "" });
  useEffect(() => {
    if (!code) return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload" || nav?.type === "back_forward") return;
    if (openEvent.current.code !== code) openEvent.current = { code, id: crypto.randomUUID() };
    const eventId = openEvent.current.id;
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      const options = { method: "POST", body: JSON.stringify({ code, eventId }), keepalive: true };
      void api("/api/link-opens", options).catch(() => { setTimeout(() => { void api("/api/link-opens", options).catch(() => {}); }, 1500); });
    };
    send(); document.addEventListener("visibilitychange", send);
    return () => document.removeEventListener("visibilitychange", send);
  }, [code]);
  useEffect(() => { if (done) success.current?.focus(); }, [done]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    submissionId.current ||= crypto.randomUUID();
    try { await api("/api/referrals", { method: "POST", body: JSON.stringify({ ...data, code, consent: data.consent === "on", submissionId: submissionId.current }) }); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <>{config.demo && <div className="demo">DEMO · Fictional information only · Local development</div>}
  <main className="parent" id="main-content">
    <aside className="patient-intro"><p className="eyebrow">A PERSONAL INTRODUCTION. A NEW BEGINNING.</p>
      <h1>Your next chapter<br />starts with<br /> <em>a smile.</em></h1>
      <p className="intro-copy">A more confident smile starts with a conversation. Share a few details, and our team will help you find a time for your orthodontic consultation.</p>
      <div className="steps" aria-label="What happens next">
        <div><span>01</span><p><b>Tell us a little about you</b><small>Just your name and the best way to reach you.</small></p></div>
        <div><span>02</span><p><b>We’ll be in touch</b><small>Our office will contact you to arrange your visit.</small></p></div>
        <div><span>03</span><p><b>Take the next step</b><small>Meet the team and explore your smile options.</small></p></div>
      </div><div className="intro-signoff">Local care. Personal attention. More reasons to smile.</div>
    </aside>
    {done ? <section className="card success-card" id="success" tabIndex={-1} ref={success}>
      <span className="success-icon" aria-hidden="true">✓</span><p className="eyebrow">REQUEST RECEIVED</p><h2>We look forward<br />to meeting you.</h2>
      <p>Thank you! Our team will contact you using the email or phone number you provided to help schedule your consultation.</p><a className="text-link" href="https://www.saratogaspringsortho.com">Explore Saratoga Springs Orthodontics ↗</a>
    </section> : <section className="card consultation" id="form-panel">
      {code ? <p className="referrer"><span className="referral-dot" aria-hidden="true" />Referred by <strong>{config.officeName}</strong></p> : <p className="eyebrow">WE’RE GLAD YOU’RE HERE</p>}
      <h2>Let’s get acquainted.</h2><p className="muted form-description">{config.welcomeText} For a child, use the parent or guardian’s email and phone.</p>
      {!config.accepting ? <p className="notice">Online requests are not open yet. Please contact <a href="https://www.saratogaspringsortho.com">our office</a>.</p> : <form id="referral-form" onSubmit={submit}>
        <label htmlFor="name">Patient name <span>Required</span></label><input id="name" name="name" autoComplete="name" maxLength={120} placeholder="First and last name" required />
        <label htmlFor="email">Email address <span>Required</span></label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" required />
        <label htmlFor="phone">Phone number <span>Required</span></label><input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} placeholder="(801) 555-0100" required />
        <label htmlFor="notes">Anything you’d like us to know? <span>Optional</span></label><textarea id="notes" name="notes" rows={3} maxLength={2000} placeholder="Questions, preferences, or a good time to call" />
        <p className="hint">Please leave out insurance numbers and detailed medical information.</p>
        <div className="trap" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
        <label className="check"><input type="checkbox" name="consent" required /><span>I am the patient or their parent/guardian, and I agree that Saratoga Springs Orthodontics may contact me by phone or email about this consultation request.</span></label>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Sending your request…" : "Request my consultation"}<span aria-hidden="true">↗</span></button>
        <p id="form-error" role="alert">{error}</p><p className="hint urgent-note">For urgent help, please call our office directly.</p>
      </form>}
    </section>}
  </main></>;
}

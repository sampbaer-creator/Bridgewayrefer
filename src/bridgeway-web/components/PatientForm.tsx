"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type PublicConfig } from "../lib/api";

export default function PatientForm({ config, code = "" }: { config: PublicConfig; code?: string }) {
  const [done, setDone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submissionId = useRef(""); const success = useRef<HTMLElement>(null); const openEvent = useRef({ code: "", id: "" });
  useEffect(() => {
    if (!code) return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload" || nav?.type === "back_forward") return;
    if (openEvent.current.code !== code) openEvent.current = { code, id: crypto.randomUUID() };
    const eventId = openEvent.current.id; let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true; const options = { method: "POST", body: JSON.stringify({ code, eventId }), keepalive: true };
      void api("/api/link-opens", options).catch(() => { setTimeout(() => { void api("/api/link-opens", options).catch(() => {}); }, 1500); });
    };
    send(); document.addEventListener("visibilitychange", send); return () => document.removeEventListener("visibilitychange", send);
  }, [code]);
  useEffect(() => { if (done) success.current?.focus(); }, [done]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true); const data = Object.fromEntries(new FormData(event.currentTarget));
    submissionId.current ||= crypto.randomUUID();
    try { await api("/api/referrals", { method: "POST", body: JSON.stringify({ ...data, code, consent: data.consent === "on", submissionId: submissionId.current }) }); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const callback = config.phone ? <a href={"tel:" + config.phone.replace(/[^\d]/g, "")}>{config.phone}</a> : null;
  return <>
    <header className="bw-intake-header">
      <a className="bw-intake-brand" href="/" aria-label="BridgeWay home">
        {config.logoUrl ? <img src={config.logoUrl} alt={config.businessName || config.officeName} /> : <span className="bw-intake-brand-text" aria-hidden="true">B</span>}
        <span className="bw-intake-brand-name">{config.logoUrl ? "" : config.businessName || config.officeName}</span>
      </a>
      <span className="bw-intake-label">SECURE REFERRAL REQUEST</span>
    </header>
    <main className="bw-intake" id="main-content">
      <aside className="bw-intake-copy">
        <p className="eyebrow">A CLEARER WAY TO GET STARTED</p>
        <h1>Your next step<br />starts with<br /><em>a conversation.</em></h1>
        <p className="bw-page-sub">Share a few details with {config.businessName || config.officeName}. Their team will follow up to learn more and plan a next step.</p>
        <div className="bw-intake-steps" aria-label="What happens next">
          <div><span>01</span><p><b>Tell us a little about you</b><small>Use the best way to reach you.</small></p></div>
          <div><span>02</span><p><b>We’ll be in touch</b><small>The receiving business will contact you directly.</small></p></div>
          <div><span>03</span><p><b>Agree on a next step</b><small>Plan together with the team.</small></p></div>
        </div>
        <div className="bw-intake-signoff">{callback ? <>Questions? Call {callback}</> : "Your information goes to the receiving business."}</div>
      </aside>
      {done ? <section className="bw-card bw-intake-success" id="success" tabIndex={-1} ref={success}>
        <span className="bw-success-icon" aria-hidden="true">✓</span>
        <p className="eyebrow">REQUEST RECEIVED</p>
        <h2>Thanks for getting<br />in touch.</h2>
        <p>{config.officeName} has your request. Their team will contact you using the email or phone number you provided.</p>
        {callback && <p>Need to reach them sooner? Call {callback}.</p>}
      </section>
        : <section className="bw-card" id="form-panel">
          <p className="bw-referrer-chip"><span className="bw-dot" aria-hidden="true" />Referred by <strong>{config.partnerName || config.officeName}</strong></p>
          <h2>Tell us what you need.</h2>
          <p className="muted">{config.welcomeText}</p>
          {!config.accepting ? <p className="notice">Online requests are not open yet.{callback ? <> Please call {callback}.</> : " Please contact the receiving business directly."}</p> : <form id="referral-form" className="bw-intake-form" onSubmit={submit}>
            <div className="bw-name-row">
              <label htmlFor="firstName">First name<span className="hint">Required</span><input id="firstName" name="firstName" autoComplete="given-name" maxLength={80} required /></label>
              <label htmlFor="lastName">Last name<span className="hint">Required</span><input id="lastName" name="lastName" autoComplete="family-name" maxLength={100} required /></label>
            </div>
            <label htmlFor="email">Email address<span className="hint">Required</span></label>
            <input id="email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" required />
            <label htmlFor="phone">Phone number<span className="hint">Required</span></label>
            <input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} placeholder="(801) 555-0100" required />
            <label htmlFor="serviceType">Request type<span className="hint">Optional</span></label>
            <input id="serviceType" name="serviceType" maxLength={80} placeholder="What kind of help do you need?" />
            <label htmlFor="postalCode">ZIP or postal code<span className="hint">Optional</span></label>
            <input id="postalCode" name="postalCode" autoComplete="postal-code" maxLength={20} placeholder="ZIP or postal code" />
            <label htmlFor="notes">Anything you’d like us to know?<span className="hint">Optional</span></label>
            <textarea id="notes" name="notes" rows={3} maxLength={2000} placeholder="Questions, preferences, or a good time to call" />
            <p className="bw-intake-notice">Please leave out payment details, clinical records, and other sensitive information.</p>
            <div className="trap" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
            <label className="bw-check"><input type="checkbox" name="consent" required /><span>I agree that {config.businessName || config.officeName} may contact me by phone or email about this request. A parent or guardian may submit for a child. <a href="/privacy">Privacy notice</a>.</span></label>
            <button type="submit" className="bw-btn bw-btn-primary bw-btn-lg" disabled={busy}>{busy ? "Sending your request…" : "Send my request"}<span aria-hidden="true">→</span></button>
            <p id="form-error" role="alert">{error}</p>
          </form>}
        </section>}
    </main>
  </>;
}

"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type PublicConfig } from "../lib/api";

export default function PatientForm({ config, code = "" }: { config: PublicConfig; code?: string }) {
  const [done, setDone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submissionId = useRef(""); const success = useRef<HTMLElement>(null); const openEvent = useRef({ code: "", id: "" });
  const trades = config.preset === "trades";
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
  const callback = config.phone ? <a href={"tel:" + config.phone.replace(/[^+\d]/g, "")}>{config.phone}</a> : null;
  return <>{config.demo && <div className="demo">DEMO · Fictional information only · Local development</div>}
    <header className="intake-header"><a className="intake-header-brand" href="/" aria-label="BridgeWay home">{config.logoUrl ? <img src={config.logoUrl} alt={config.businessName || config.officeName} /> : <span className="intake-brand-text" aria-hidden="true">B</span>}<span>{config.logoUrl ? "" : config.businessName || config.officeName}</span></a><span className="intake-label">SECURE REFERRAL REQUEST</span></header>
    <main className="parent" id="main-content">
      <aside className="patient-intro"><p className="eyebrow">{trades ? "A CLEARER WAY TO GET STARTED" : "A PERSONAL INTRODUCTION. A NEW BEGINNING."}</p>
        <h1>{trades ? <>Your next project<br/>starts with<br/><em>a conversation.</em></> : <>Your next chapter<br/>starts with<br/><em>a smile.</em></>}</h1>
        <p className="intro-copy">{trades ? "Tell North Star HVAC a little about the work you need. Their team will follow up to learn more and plan a next step." : `A more confident smile starts with a conversation. Share a few details, and ${config.officeName} will help you find a time for an orthodontic consultation.`}</p>
        <div className="steps" aria-label="What happens next"><div><span>01</span><p><b>{trades ? "Tell us about the work" : "Tell us a little about you"}</b><small>{trades ? "Choose a service and share your ZIP code." : "Use the best way to reach you."}</small></p></div><div><span>02</span><p><b>We’ll be in touch</b><small>The receiving business will contact you directly.</small></p></div><div><span>03</span><p><b>Agree on a next step</b><small>{trades ? "Plan a quote or a site visit." : "Arrange a consultation with the team."}</small></p></div></div>
        <div className="intro-signoff">{callback ? <>Questions? Call {callback}</> : "Your information goes to the receiving business."}</div>
      </aside>
      {done ? <section className="card success-card" id="success" tabIndex={-1} ref={success}><span className="success-icon" aria-hidden="true">✓</span><p className="eyebrow">REQUEST RECEIVED</p><h2>{trades ? <>Thanks for getting<br/>in touch.</> : <>We look forward<br/>to meeting you.</>}</h2><p>{config.officeName} has your request. Their team will contact you using the email or phone number you provided.</p>{callback && <p>Need to reach them sooner? Call {callback}.</p>}</section>
        : <section className="card consultation" id="form-panel"><p className="referrer"><span className="referral-dot" aria-hidden="true"/>Referred by <strong>{config.officeName}</strong></p><h2>{trades ? "What can we help with?" : "Let’s get acquainted."}</h2><p className="muted form-description">{config.welcomeText}{!trades && " For a child, use the parent or guardian’s email and phone."}</p>
          {!config.accepting ? <p className="notice">Online requests are not open yet.{callback ? <> Please call {callback}.</> : " Please contact the receiving business directly."}</p> : <form id="referral-form" onSubmit={submit}>
            <div className="name-fields"><label htmlFor="firstName">First name<span>Required</span><input id="firstName" name="firstName" autoComplete="given-name" maxLength={80} required /></label><label htmlFor="lastName">Last name<span>Required</span><input id="lastName" name="lastName" autoComplete="family-name" maxLength={100} required /></label></div>
            <label htmlFor="email">Email address<span>Required</span></label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" required />
            <label htmlFor="phone">Phone number<span>Required</span></label><input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} placeholder="(801) 555-0100" required />
            {trades && <><label htmlFor="serviceType">Service needed<span>Optional</span></label><select id="serviceType" name="serviceType" defaultValue=""><option value="">Choose a service</option><option>Heating</option><option>Cooling</option><option>Maintenance</option><option>Other</option></select><label htmlFor="postalCode">Project ZIP code<span>Optional</span></label><input id="postalCode" name="postalCode" autoComplete="postal-code" maxLength={20} placeholder="ZIP code" /></>}
            <label htmlFor="notes">{trades ? "Project details" : "Anything you’d like us to know?"}<span>Optional</span></label><textarea id="notes" name="notes" rows={3} maxLength={2000} placeholder={trades ? "Briefly describe the work you need" : "Questions, preferences, or a good time to call"}/>
            <p className="hint">{trades ? "Please leave out payment details." : "Please leave out insurance numbers and detailed medical information."}</p><div className="trap" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off"/></div>
            <label className="check"><input type="checkbox" name="consent" required/><span>I agree that {config.businessName || config.officeName} may contact me by phone or email about this request. A parent or guardian may submit for a child.</span></label>
            <button type="submit" className="primary" disabled={busy}>{busy ? "Sending your request…" : trades ? "Request a callback" : "Request my consultation"}<span aria-hidden="true">↗</span></button><p id="form-error" role="alert">{error}</p>
          </form>}
        </section>}
    </main></>;
}

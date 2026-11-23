"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type PublicConfig } from "../lib/api";

function IntakeBrand({ config }: { config: PublicConfig }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const office = config.officeName || config.businessName || "BridgeWayRefer";
  const candidates = [
    { url: config.logoUrl?.trim(), name: config.businessName || office },
    { url: config.officeLogoUrl?.trim(), name: office },
  ];
  const logo = candidates.find(({ url }) => url && !failedUrls.includes(url));

  if (!logo?.url) return <span className="bw-intake-brand-name">{office}</span>;
  const { url, name } = logo;
  return <img key={url} src={url} alt={name} referrerPolicy="no-referrer"
    onError={() => setFailedUrls(urls => [...urls, url])} />;
}

export default function PatientForm({ config, code = "", preview = false }: { config: PublicConfig; code?: string; preview?: boolean }) {
  const [done, setDone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submissionId = useRef(""); const success = useRef<HTMLElement>(null); const openEvent = useRef({ code: "", id: "" });
  useEffect(() => {
    if (preview || !code) return;
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
  }, [code, preview]);
  useEffect(() => { if (done) success.current?.focus(); }, [done]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    setError(""); setBusy(true); const data = Object.fromEntries(new FormData(event.currentTarget));
    submissionId.current ||= crypto.randomUUID();
    try { await api("/api/referrals", { method: "POST", body: JSON.stringify({ ...data, code, consent: data.consent === "on", submissionId: submissionId.current }) }); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const callback = config.phone ? <a href={"tel:" + config.phone.replace(/[^\d]/g, "")}>{config.phone}</a> : null;
  const design = config.patientForm;
  const consultation = design?.template === "consultation";
  const office = config.officeName || config.businessName || "the receiving office";
  const website = design?.websiteUrl && /^https:\/\//i.test(design.websiteUrl.trim()) ? design.websiteUrl.trim() : undefined;
  const introSteps = consultation
    ? [
        ["Tell us a little about you", "Share your name and the best way to reach you."],
        ["We will be in touch", "Our office will contact you to arrange your visit."],
        ["Take the next step", "Meet the team and explore your smile options."],
      ]
    : [
        ["Tell us a little about you", "Use the best way to reach you."],
        ["We will be in touch", "The receiving business will contact you directly."],
        ["Agree on a next step", "Plan together with the team."],
      ];
  const IntakeContainer = preview ? "div" : "main";
  return <>
    <header className="bw-intake-header">
      <div className="bw-intake-brand">
        <IntakeBrand config={config} />
      </div>
    </header>
    <IntakeContainer className="bw-intake" id={preview ? undefined : "main-content"}>
      <aside className="bw-intake-copy">
        <p className="eyebrow">{consultation ? "A PERSONAL INTRODUCTION" : "A CLEARER WAY TO GET STARTED"}</p>
        <h1>{design?.headline || (consultation
          ? <>Your next chapter starts with <em>a smile.</em></>
          : <>Your next step starts with <em>a conversation.</em></>)}</h1>
        <p className="bw-page-sub">{design?.introduction || (consultation
          ? "A more confident smile starts with a conversation. Share a few details and our team will help you arrange an orthodontic consultation."
          : `Share a few details with ${office}. Their team will follow up to learn more and plan a next step.`)}</p>
        <ol className="bw-intake-steps" aria-label="What happens next">
          {introSteps.map(([title, copy], index) => <li key={title}><span aria-hidden="true">0{index + 1}</span><p><b>{title}</b><small>{copy}</small></p></li>)}
        </ol>
        <div className="bw-intake-signoff">{callback ? <>Questions? Call {callback}</> : "Your information goes to the receiving business."}</div>
      </aside>
      {done ? <section className="bw-card bw-intake-success" id="success" tabIndex={-1} ref={success}>
        <span className="bw-success-icon" aria-hidden="true">✓</span>
        <p className="eyebrow">REQUEST RECEIVED</p>
        <h2>{design?.successHeading || (consultation ? "We look forward to meeting you." : "Thanks for getting in touch.")}</h2>
        <p>{office} has your request. Their team will contact you using the email or phone number you provided.</p>
        {callback && <p>Need to reach them sooner? Call {callback}.</p>}
        {website && <a href={website}>Visit the office website</a>}
      </section>
        : <section className="bw-card" id="form-panel">
          {config.partnerName
            ? <p className="bw-referrer-chip"><span className="bw-dot" aria-hidden="true" />Referred by <strong>{config.partnerName}</strong></p>
            : <p className="eyebrow">WELCOME</p>}
          <h2>{design?.formHeading || (consultation ? "Let's get acquainted." : "Tell us what you need.")}</h2>
          <p className="muted">{config.welcomeText || (consultation
            ? "Request a consultation below. For a child, use the parent or guardian's contact details."
            : "Share a few details and our team will be in touch.")}</p>
          {!config.accepting && <p className="notice">Online requests are not open yet.{callback
            ? <> Please call {callback}.</>
            : website ? <> Please <a href={website}>visit the office website</a>.</> : " Please contact the receiving business directly."}</p>}
          {(config.accepting || preview) && <form id="referral-form" className="bw-intake-form" onSubmit={submit}>
            <div className="bw-name-row">
              <label htmlFor="firstName">First name<span className="hint">Required</span><input id="firstName" name="firstName" autoComplete={preview ? "off" : "given-name"} maxLength={80} required /></label>
              <label htmlFor="lastName">Last name<span className="hint">Required</span><input id="lastName" name="lastName" autoComplete={preview ? "off" : "family-name"} maxLength={100} required /></label>
            </div>
            <label htmlFor="email">Email address<span className="hint">Required</span></label>
            <input id="email" name="email" type="email" autoComplete={preview ? "off" : "email"} maxLength={254} placeholder="you@example.com" required />
            <label htmlFor="phone">Phone number<span className="hint">Required</span></label>
            <input id="phone" name="phone" type="tel" autoComplete={preview ? "off" : "tel"} maxLength={40} placeholder="(801) 555-0100" required />
            <label htmlFor="serviceType">Request type<span className="hint">Optional</span></label>
            <input id="serviceType" name="serviceType" maxLength={80} placeholder="What kind of help do you need?" />
            <label htmlFor="postalCode">ZIP or postal code<span className="hint">Optional</span></label>
            <input id="postalCode" name="postalCode" autoComplete={preview ? "off" : "postal-code"} maxLength={20} placeholder="ZIP or postal code" />
            <label htmlFor="notes">Anything you’d like us to know?<span className="hint">Optional</span></label>
            <textarea id="notes" name="notes" rows={3} maxLength={2000} placeholder="Questions, preferences, or a good time to call" />
            <p className="bw-intake-notice">Please leave out payment details, clinical records, and other sensitive information.</p>
            <div className="trap" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
            <label className="bw-check"><input type="checkbox" name="consent" required /><span>I agree that {config.businessName || config.officeName} may contact me by phone or email about this request. A parent or guardian may submit for a child. <a href="/privacy">Privacy notice</a>.</span></label>
            <button type="submit" className="bw-btn bw-btn-primary bw-btn-lg" disabled={busy || preview}>{busy ? "Sending your request..." : design?.submitLabel || (consultation ? "Request my consultation" : "Send my request")}<span aria-hidden="true">→</span></button>
            <p id="form-error" role="alert">{error}</p>
            {callback && <p className="hint">For urgent help, call the office directly at {callback}.</p>}
          </form>}
        </section>}
      {!preview && <p className="hint">Powered by BridgeWay referral tracking</p>}
    </IntakeContainer>
  </>;
}

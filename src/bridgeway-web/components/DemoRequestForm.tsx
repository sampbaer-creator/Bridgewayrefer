"use client";
import { useRef, useState, type FormEvent } from "react";
import { api } from "../lib/api";

export default function DemoRequestForm() {
  const requestId = useRef("");
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = new FormData(event.currentTarget); requestId.current ||= crypto.randomUUID();
    try { await api("/api/demo-requests", { method: "POST", body: JSON.stringify({ name: values.get("name"), email: values.get("email"), businessName: values.get("businessName"), consent: values.get("consent") === "on", submissionId: requestId.current }) }); setDone(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not send your request. Please try again."); }
    finally { setBusy(false); }
  }
  if (done) return <div className="bw-form-success" role="status"><h2>Request received</h2><p>Your request is available to the BridgeWay team. We can contact you at the email you provided.</p></div>;
  return <form onSubmit={submit} className="bw-contact-form" aria-label="Book a demo">
    <div className="bw-name-row">
      <label className="bw-field">Your name<input name="name" autoComplete="name" maxLength={120} required /></label>
      <label className="bw-field">Work email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    </div>
    <label className="bw-field">Practice or business<input name="businessName" autoComplete="organization" maxLength={120} required /></label>
    <label className="bw-check"><input name="consent" type="checkbox" required /><span>I agree that BridgeWay may contact me about this request. Please do not include patient information.</span></label>
    <p className="bw-form-note bw-contact-privacy">Read our <a href="/privacy">privacy notice</a> before submitting.</p>
    <button className="bw-btn bw-btn-primary bw-btn-lg" disabled={busy}>{busy ? "Sending…" : "Book a demo"}</button>
    {error && <p className="bw-form-alert" role="alert">{error}</p>}
  </form>;
}

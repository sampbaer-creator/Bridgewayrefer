"use client";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

export default function DemoRequestForm() {
  const [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/demo-requests", { method: "POST", body: JSON.stringify({ name: form.get("name"), email: form.get("email"), businessName: form.get("businessName"), consent: form.get("consent") === "on", submissionId: crypto.randomUUID() }) });
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  if (sent) return <p className="demo-success" role="status">Thanks. Your demo request is in the BridgeWay team inbox.</p>;
  return <form className="demo-form" onSubmit={submit}>
    <label htmlFor="demo-name">Your name<input id="demo-name" name="name" autoComplete="name" maxLength={120} required /></label>
    <label htmlFor="demo-email">Work email<input id="demo-email" name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    <label htmlFor="demo-business">Business name<input id="demo-business" name="businessName" autoComplete="organization" maxLength={120} required /></label>
    <label className="demo-consent"><input type="checkbox" name="consent" required /><span>I agree BridgeWay may contact me about a product demo.</span></label>
    <button className="primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Request a demo"}<span aria-hidden="true">↗</span></button>
    <p className="error-message" role="alert">{error}</p>
  </form>;
}

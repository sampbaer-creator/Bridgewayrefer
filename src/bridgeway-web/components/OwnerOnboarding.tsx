"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, WORKSPACE_KEY } from "../lib/api";
import { ProviderButton } from "./GoogleSignIn";

const KEY = "bridgeway.onboarding";
type Status = { testMode?: boolean; ownerName?: string; ownerEmail?: string; alertEmail?: string; industry?: string; specialty?: string; monthlyPriceUsd?: number; businessName: string; plan: string; status: "active" | "awaiting_payment"; paymentConfirmed: boolean };
type View = "loading" | "missing" | "signed-out" | "ready" | "confirming" | "active" | "error";
const planLabels: Record<string, string> = { workspace: "Workspace", "managed-calling": "Managed Calling" };

export default function OwnerOnboarding() {
  const [link, setLink] = useState<{ workspace: string; token: string } | null>(null);
  const [view, setView] = useState<View>("loading"), [status, setStatus] = useState<Status | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [checkout, setCheckout] = useState("");

  const check = useCallback(async (current: { workspace: string; token: string }) => {
    try {
      const result = await api<Status>("/api/onboarding/status", { method: "POST", body: JSON.stringify(current) });
      setStatus(result);
      if (result.status === "active") { localStorage.setItem(WORKSPACE_KEY, current.workspace); setView("active"); return result; }
      setView(result.paymentConfirmed ? "confirming" : "ready"); return result;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setView("signed-out");
      else { setMessage(e instanceof Error ? e.message : "Could not check this setup link."); setView("error"); }
      return null;
    }
  }, []);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (fragment.get("token") && fragment.get("workspace")) {
      sessionStorage.setItem(KEY, JSON.stringify({ workspace: fragment.get("workspace"), token: fragment.get("token") }));
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    const returned = new URLSearchParams(window.location.search).get("checkout") || "";
    setCheckout(returned);
    let stored: { workspace: string; token: string } | null = null;
    try { stored = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { stored = null; }
    if (!stored?.workspace || !stored.token) { setView("missing"); return; }
    setLink(stored);
    void check(stored);
  }, [check]);

  // After Stripe redirects back, wait for the verified webhook to open the workspace. The redirect alone grants nothing.
  useEffect(() => {
    if (!link || checkout !== "success" || view === "active" || view === "signed-out" || view === "error") return;
    let tries = 0;
    const timer = window.setInterval(() => { tries += 1; if (tries > 40) { window.clearInterval(timer); return; } void check(link); }, 3000);
    return () => window.clearInterval(timer);
  }, [link, checkout, view, check]);

  async function pay() {
    if (!link) return;
    setBusy(true); setMessage("");
    try {
      const result = await api<{ url?: string; active?: boolean; paymentConfirmed?: boolean }>("/api/onboarding/checkout", { method: "POST", body: JSON.stringify({ ...link, confirmDetails: confirmed }) });
      if (result.url) { window.location.assign(result.url); return; }
      await check(link);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not open checkout. Try again."); }
    finally { setBusy(false); }
  }

  const signIn = (provider: "microsoft" | "google") => <ProviderButton provider={provider} hrefOverride={`/staff/login?flow=onboard&provider=${provider}`} />;
  return <section className="bw-access" aria-label="Finish setup">
    <div className="bw-access-card">
      <p className="eyebrow">BRIDGEWAY SETUP</p>
      <h1>{status?.businessName ? `Finish setting up ${status.businessName}` : "Finish your BridgeWay setup"}</h1>
      {status?.testMode && <p className="notice" role="status"><strong>Stripe sandbox</strong> - this is a test workspace. No real money is collected. Use test card 4242 4242 4242 4242, any future expiry, and any three-digit CVC.</p>}
      {view === "loading" && <p role="status">Checking your setup link…</p>}
      {view === "missing" && <p>Open the setup link from your BridgeWay email. If it has expired, ask BridgeWay for a new one.</p>}
      {view === "signed-out" && <>
        <p className="muted">Sign in with the email address that received this link.</p>
        <div className="bw-auth-providers">{signIn("microsoft")}{signIn("google")}</div>
      </>}
      {view === "ready" && status && <>
        {checkout === "cancelled" && <p className="notice" role="status">Checkout was canceled. Your workspace is saved; you can pay whenever you are ready.</p>}
        <h2>Review your details</h2>
        <dl className="bw-setup-details">
          <dt>Business</dt><dd>{status.businessName}</dd>
          <dt>Owner</dt><dd>{status.ownerName} {status.ownerEmail}</dd>
          <dt>Referral alerts</dt><dd>{status.alertEmail || status.ownerEmail}</dd>
          <dt>Industry / specialty</dt><dd>{status.industry} / {status.specialty}</dd>
          <dt>Subscription</dt><dd>{planLabels[status.plan] ?? status.plan}{status.monthlyPriceUsd != null && ` - $${status.monthlyPriceUsd}/month`}</dd>
        </dl>
        <p>Need a correction? <a href="mailto:Bridgewayrefer@outlook.com">Contact BridgeWay</a> before paying.</p>
        <label className="bw-setup-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I confirm these details are correct.</label>
        <p>Setup is pending. Your dashboard opens as soon as payment is confirmed.</p>
        <p className="muted">Plan: {planLabels[status.plan] ?? status.plan}. Payment is handled securely by Stripe.</p>
        <button className="bw-btn bw-btn-primary" disabled={busy || !confirmed} onClick={() => void pay()}>{busy ? "Opening Stripe…" : status.testMode ? "Continue to test payment" : "Continue to payment"}</button>
      </>}
      {view === "confirming" && <p role="status">Payment received. We are confirming it with Stripe; this page updates automatically.</p>}
      {view === "ready" && checkout === "success" && <p role="status">Waiting for Stripe to confirm your payment. This page updates automatically.</p>}
      {view === "active" && <>
        <p>Your workspace is ready.</p>
        <a className="bw-btn bw-btn-primary" href="/staff" onClick={() => sessionStorage.removeItem(KEY)}>Open your dashboard</a>
      </>}
      {view === "error" && <><p role="alert">{message}</p><p><a href="/sign-in">Sign in with a different account</a></p></>}
      {message && view !== "error" && <p role="alert" className="bw-form-alert">{message}</p>}
    </div>
  </section>;
}

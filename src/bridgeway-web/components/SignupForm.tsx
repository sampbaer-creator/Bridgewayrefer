"use client";

import { useEffect, useState, type FormEvent } from "react";
import GoogleSignIn, { ProviderButton } from "./GoogleSignIn";
import Link from "next/link";
import GoogleSignIn from "./GoogleSignIn";
import { api, WORKSPACE_KEY } from "../lib/api";

type Plan = "workspace" | "managed-calling";
type SignupState = { signedIn: boolean; enabled: boolean; plans: { workspace: { amountUsd: number; available: boolean }; managedCalling: { amountUsd: number; available: boolean } } };

export default function SignupForm() {
  const [state, setState] = useState<SignupState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<Plan>("workspace");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("plan") === "managed-calling") setPlan("managed-calling");
    const controller = new AbortController();
    api<SignupState>("/api/signup", { signal: controller.signal }).then(value => {
      const next = { ...value, plans: value.plans ?? { workspace: { amountUsd: 50, available: true }, managedCalling: { amountUsd: 400, available: false } } };
      setState(next);
      if (!next.plans.managedCalling.available) setPlan(current => current === "managed-calling" ? "workspace" : current);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Could not check signup availability. Please try again.");
    });
    return () => controller.abort();
  }, []);

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const signup = await api<{ businessId: string; signupPending: boolean }>("/api/signup", {
        method: "POST", body: JSON.stringify({ name: data.get("name"), officeName: String(data.get("officeName") || "").trim() || undefined, alertEmail: String(data.get("alertEmail") || "").trim() || undefined, plan }),
      });
      window.localStorage.setItem(WORKSPACE_KEY, signup.businessId);
      if (!signup.signupPending) {
        window.location.assign("/staff");
        return;
      }
      const checkout = await api<{ url: string }>("/api/staff/billing/checkout", {
        method: "POST", headers: { "X-Bridgewayrefer-Business": signup.businessId }, body: JSON.stringify({ plan }),
      });
      window.location.assign(checkout.url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not start checkout.");
      setBusy(false);
    }
  }

  return (
    <section className="bw-access-card" aria-label="Business signup">
      {error && <p role="alert" className="bw-form-alert">{error}</p>}
      {!state && !error && (
        <div className="bw-form-skeleton" role="status" aria-label="Checking signup availability">
          <span className="bw-skeleton-line" style={{ width: "72%" }} />
          <span className="bw-skeleton-line" style={{ width: "48%" }} />
          <span className="bw-skeleton-line bw-skeleton-btn" />
        </div>
      )}
      {state && !state.enabled && <p>Sign-up is unavailable right now. Please try again soon or contact us.</p>}
      {state?.enabled && !state.signedIn && <>
        <p>Sign in with the account you will use to manage your business.</p>
        <div className="bw-auth-providers">
          <ProviderButton provider="microsoft" signup />
          <GoogleSignIn signup outlined />
        </div>
      </>}
      {state && (!state.enabled || !state.signedIn) && <p><Link href="/contact">Request a Corporate quote</Link></p>}
      {state?.enabled && state.signedIn && <form onSubmit={startCheckout} className="bw-contact-form">
        <fieldset className="bw-plan-select">
          <legend>Choose a plan</legend>
          <label className={plan === "workspace" ? "bw-plan-option selected" : "bw-plan-option"}>
            <input type="radio" name="plan" value="workspace" checked={plan === "workspace"} onChange={() => setPlan("workspace")} />
            <span><b>Referral Workspace · ${state.plans.workspace.amountUsd}/business/month</b><small>Referral tracking, partners, staff access, reports and NFC cards.</small></span>
          </label>
          <label className={plan === "managed-calling" ? "bw-plan-option selected" : "bw-plan-option"}>
            <input type="radio" name="plan" value="managed-calling" checked={plan === "managed-calling"} disabled={!state.plans.managedCalling.available} onChange={() => setPlan("managed-calling")} />
            <span><b>Managed Calling · ${state.plans.managedCalling.amountUsd}/business/month</b><small>Includes Referral Workspace, plus cold calling and CRM follow-up handled by BridgeWay.{!state.plans.managedCalling.available ? " Not available online yet. Contact us." : ""}</small></span>
          </label>
          <Link href="/contact" className="bw-plan-option">
            <span><b>Corporate · Custom pricing</b><small>Request a quote tailored to your business.</small></span>
          </Link>
        </fieldset>
        <label className="bw-field">Business name<input name="name" autoComplete="organization" minLength={2} maxLength={120} required /></label>
        <div className="bw-name-row">
          <label className="bw-field">Main location name<span className="hint">Optional</span><input name="officeName" autoComplete="organization-title" maxLength={120} /></label>
          <label className="bw-field">Alert email<span className="hint">Optional</span><input name="alertEmail" type="email" autoComplete="email" maxLength={254} /></label>
        </div>
        <button className="bw-btn bw-btn-primary bw-btn-lg" disabled={busy}>{busy ? "Opening checkout…" : "Continue to Stripe checkout →"}</button>
      </form>}
    </section>
  );
}

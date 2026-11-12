"use client";

import { useEffect, useState, type FormEvent } from "react";
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
      {!state && !error && <p role="status" className="bw-form-note">Checking signup availability…</p>}
      {state && !state.enabled && <p>Online subscriptions are currently unavailable.</p>}
      {state?.enabled && !state.signedIn && <>
        <p>Sign in with the account you’ll use to manage your business.</p>
        <a className="bw-btn bw-btn-primary" href="/staff/login?flow=signup">Continue with Microsoft</a>
      </>}
      {state?.enabled && state.signedIn && <form onSubmit={startCheckout} className="bw-contact-form">
        <fieldset className="bw-plan-select">
          <legend>Choose a monthly plan</legend>
          <label className={plan === "workspace" ? "bw-plan-option selected" : "bw-plan-option"}>
            <input type="radio" name="plan" value="workspace" checked={plan === "workspace"} onChange={() => setPlan("workspace")} />
            <span><b>Workspace · ${state.plans.workspace.amountUsd}/month</b><small>Referral tracking, offices, partners, staff access, and reports.</small></span>
          </label>
          <label className={plan === "managed-calling" ? "bw-plan-option selected" : "bw-plan-option"}>
            <input type="radio" name="plan" value="managed-calling" checked={plan === "managed-calling"} disabled={!state.plans.managedCalling.available} onChange={() => setPlan("managed-calling")} />
            <span><b>Managed Calling · ${state.plans.managedCalling.amountUsd}/month</b><small>Includes the workspace plan. Our team calls your referrals and records follow-up in your workspace.{!state.plans.managedCalling.available ? " Online checkout is not configured yet; contact Bridgewayrefer." : ""}</small></span>
          </label>
        </fieldset>
        <label className="bw-field">Business name<input name="name" autoComplete="organization" minLength={2} maxLength={120} required /></label>
        <div className="bw-name-row">
          <label className="bw-field">Main office name<span className="hint">Optional</span><input name="officeName" autoComplete="organization-title" maxLength={120} /></label>
          <label className="bw-field">Alert email<span className="hint">Optional</span><input name="alertEmail" type="email" autoComplete="email" maxLength={254} /></label>
        </div>
        <button className="bw-btn bw-btn-primary bw-btn-lg" disabled={busy}>{busy ? "Opening Stripe…" : "Continue to Stripe checkout →"}</button>
      </form>}
    </section>
  );
}

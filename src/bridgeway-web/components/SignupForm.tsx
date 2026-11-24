"use client";

import { useEffect, useState, type FormEvent } from "react";
import GoogleSignIn, { ProviderButton } from "./GoogleSignIn";
import Link from "next/link";
import { api, WORKSPACE_KEY } from "../lib/api";

import { planCopy } from "../lib/plan-copy";
import { healthcareSpecialties, tradeSpecialties } from "../lib/business-specialties";

type Plan = "workspace" | "managed-calling";
type SignupState = { signedIn: boolean; enabled: boolean; plans: { workspace: { amountUsd: number; available: boolean }; managedCalling: { amountUsd: number; available: boolean } } };

export default function SignupForm() {
  const [state, setState] = useState<SignupState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [industry, setIndustry] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [plan, setPlan] = useState<Plan>("workspace");

  const [attempt, setAttempt] = useState(0);
  // A plan-specific link (?plan=…) shows only that plan; /signup with no plan keeps the chooser.
  const [fixedPlan, setFixedPlan] = useState<Plan | "corporate" | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("plan");
    if (requested === "managed-calling") setPlan("managed-calling");
    if (requested === "workspace" || requested === "managed-calling") setFixedPlan(requested);
    if (requested === "corporate" || window.location.hash === "#corporate") setFixedPlan("corporate");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api<SignupState>("/api/signup", { signal: controller.signal }).then(value => {
      const next = { ...value, plans: value.plans ?? { workspace: { amountUsd: 50, available: true }, managedCalling: { amountUsd: 400, available: false } } };
      setState(next);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Could not check signup availability. Please try again.");
    });
    return () => controller.abort();
  }, [attempt]);

  const available = state?.enabled && (plan === "managed-calling" ? state.plans.managedCalling.available : state.plans.workspace.available);

  function choosePlan(nextPlan: Plan) {
    const url = new URL(window.location.href);
    url.searchParams.set("plan", nextPlan);
    window.history.replaceState(null, "", url);
    setPlan(nextPlan);
  }

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || busy) return;
    const data = new FormData(event.currentTarget);
    const businessSpecialty = (specialty === "custom" ? String(data.get("customSpecialty") || "") : specialty).trim();
    if (!businessSpecialty) {
      setError("Enter your business specialty.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const signup = await api<{ businessId: string; signupPending: boolean }>("/api/signup", {
        method: "POST", body: JSON.stringify({ name: data.get("name"), industry, specialty: businessSpecialty, officeName: String(data.get("officeName") || "").trim() || undefined, alertEmail: String(data.get("alertEmail") || "").trim() || undefined, plan }),
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

  if (fixedPlan === "corporate") return (
    <section className="bw-access-card" aria-label="Business signup">
      <h1>Corporate plans</h1>
      <p>Corporate pricing is custom. Tell us about your organization and BridgeWay will put together a quote.</p>
      <div className="bw-plan-single" id="corporate"><b>Corporate · Custom pricing</b><small>Multiple locations, custom onboarding and invoicing, arranged directly with BridgeWay.</small></div>
      <div className="bw-signup-actions"><Link className="bw-btn bw-btn-primary" href="/#walkthrough">Request a quote</Link></div>
    </section>
  );

  const single = fixedPlan === "workspace" || fixedPlan === "managed-calling";
  return (
    <section className="bw-access-card" aria-label="Business signup">
      <h1>{single ? `Set up ${plan === "managed-calling" ? planCopy.managedCalling.name : planCopy.workspace.name}` : "Set up your BridgeWay account"}</h1>
      <p>{single ? "Sign in, add your business details, and complete payment." : "Choose a plan, sign in, and set up your business."}</p>
        {single ? <>
          <div className="bw-plan-single">
            <b>{plan === "managed-calling" ? `${planCopy.managedCalling.name} · from $${state?.plans.managedCalling.amountUsd ?? 400}/month` : `${planCopy.workspace.name} · from $${state?.plans.workspace.amountUsd ?? 50}/month`}</b>
            <small>{plan === "managed-calling" ? "Includes Referral Workspace, plus cold calling and CRM follow-up handled by BridgeWay." : "Referral tracking, partners, staff access, reports and NFC card management."}</small>
          </div>
          <p className="bw-plan-other">Need a different plan? <Link href="/#walkthrough">Contact BridgeWay</Link>.</p>
        </> : <fieldset className="bw-plan-select">
          <legend>Choose a plan</legend>
          <label className={plan === "workspace" ? "bw-plan-option selected" : "bw-plan-option"}>
            <input type="radio" name="plan" value="workspace" checked={plan === "workspace"} onChange={() => choosePlan("workspace")} />
            <span><b>{planCopy.workspace.name} &middot; from ${(state?.plans.workspace.amountUsd ?? 50)}/month</b><small>Referral tracking, partners, staff access, reports and NFC card management.</small></span>
          </label>
          <label className={plan === "managed-calling" ? "bw-plan-option selected" : "bw-plan-option"}>
            <input type="radio" name="plan" value="managed-calling" checked={plan === "managed-calling"} onChange={() => choosePlan("managed-calling")} />
            <span><b>{planCopy.managedCalling.name} &middot; from ${(state?.plans.managedCalling.amountUsd ?? 400)}/month</b><small>Includes Referral Workspace, plus cold calling and CRM follow-up handled by BridgeWay.</small></span>
          </label>
          <Link href="/#walkthrough" className="bw-plan-option">
            <span id="corporate"><b>Corporate · Custom pricing</b><small>Request a custom quote through BridgeWay.</small></span>
          </Link>
        </fieldset>}
      {error && <p role="alert" className="bw-form-alert">{error}</p>}
      {!state && !error && (
        <div className="bw-form-skeleton" role="status" aria-label="Checking signup availability">
          <span className="bw-skeleton-line" style={{ width: "72%" }} />
          <span className="bw-skeleton-line" style={{ width: "48%" }} />
          <span className="bw-skeleton-line bw-skeleton-btn" />
        </div>
      )}
      {!state && error && <div className="bw-signup-actions">
        <button className="bw-btn bw-btn-secondary" type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button>
        <Link className="bw-btn bw-btn-ghost" href="/#walkthrough">Contact BridgeWay</Link>
      </div>}
      {state && !available && <div>
        <p role="status">{state.enabled ? "This plan requires help from BridgeWay to get started." : "Online checkout is currently unavailable."} Contact BridgeWay and we will send you a setup link.</p>
        <Link className="bw-btn bw-btn-primary" href="/#walkthrough">Contact BridgeWay</Link>
      </div>}
      {available && !state?.signedIn && <>
        <p>Sign in with the account you will use to manage your business.</p>
        <div className="bw-auth-providers">
          <ProviderButton provider="microsoft" signup plan={plan} />
          <GoogleSignIn signup outlined plan={plan} />
        </div>
      </>}
      {available && state?.signedIn && <form onSubmit={startCheckout} className="bw-contact-form">

        <label className="bw-field">Business name<input name="name" autoComplete="organization" minLength={2} maxLength={120} required /></label>
        <label className="bw-field"><span id="signup-industry-label">Industry</span>
          <select aria-labelledby="signup-industry-label" name="industry" value={industry} required onChange={event => { setIndustry(event.target.value); setSpecialty(""); }}>
            <option value="" disabled>Choose your industry</option>
            <option value="healthcare">Healthcare (includes dental)</option>
            <option value="trades">Home service trades</option>
            <option value="other">Other industry</option>
          </select>
        </label>
        {industry && <label className="bw-field"><span id="signup-specialty-label">Business specialty</span>
          <select aria-labelledby="signup-specialty-label" name="specialty" value={specialty} required onChange={event => setSpecialty(event.target.value)}>
            <option value="" disabled>Choose your specialty</option>
            {industry === "healthcare" && Object.entries(healthcareSpecialties).map(([group, options]) => (
              <optgroup label={group} key={group}>{options.map(option => <option key={option} value={option}>{option}</option>)}</optgroup>
            ))}
            {industry === "trades" && tradeSpecialties.map(option => <option key={option} value={option}>{option}</option>)}
            <option value="custom">Other / Type your own</option>
          </select>
        </label>}
        {industry && specialty === "custom" && <label className="bw-field">Your business specialty
          <input name="customSpecialty" required maxLength={120} pattern=".*\S.*" placeholder="Type your specialty" />
        </label>}
        <div className="bw-name-row">
          <label className="bw-field">Main location name<span className="hint">Optional</span><input name="officeName" autoComplete="organization-title" maxLength={120} /></label>
          <label className="bw-field">Alert email<span className="hint">Optional</span><input name="alertEmail" type="email" autoComplete="email" maxLength={254} /></label>
        </div>
        <button className="bw-btn bw-btn-primary bw-btn-lg" disabled={busy}>{busy ? "Opening checkout…" : "Continue to Stripe checkout →"}</button>
      </form>}
    </section>
  );
}


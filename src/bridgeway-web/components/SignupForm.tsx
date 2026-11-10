"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, WORKSPACE_KEY } from "../lib/api";

type SignupState = { signedIn: boolean; enabled: boolean };

export default function SignupForm() {
  const [state, setState] = useState<SignupState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<SignupState>("/api/signup", { signal: controller.signal }).then(setState).catch(() => {
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
        method: "POST", body: JSON.stringify({ name: data.get("name"), officeName: String(data.get("officeName") || "").trim() || undefined, alertEmail: String(data.get("alertEmail") || "").trim() || undefined }),
      });
      window.localStorage.setItem(WORKSPACE_KEY, signup.businessId);
      if (!signup.signupPending) {
        window.location.assign("/staff");
        return;
      }
      const checkout = await api<{ url: string }>("/api/staff/billing/checkout", {
        method: "POST", headers: { "X-BridgeWay-Business": signup.businessId }, body: "{}",
      });
      window.location.assign(checkout.url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not start checkout.");
      setBusy(false);
    }
  }

  return (
    <section className="card access-form" aria-label="Business signup">
      {error && <p role="alert" className="error-message">{error}</p>}
      {!state && !error && <p role="status">Checking signup availability…</p>}
      {state && !state.enabled && <p>Online subscriptions are currently unavailable.</p>}
      {state?.enabled && !state.signedIn && <>
        <p>Sign in with the account you’ll use to manage your business.</p>
        <a className="access-action" href="/staff/login?flow=signup">Continue with Microsoft (Entra)</a>
      </>}
      {state?.enabled && state.signedIn && <form onSubmit={startCheckout}>
        <label>Business name<input name="name" autoComplete="organization" minLength={2} maxLength={120} required /></label>
        <label>Main office name<span>Optional</span><input name="officeName" autoComplete="organization-title" maxLength={120} /></label>
        <label>Alert email<span>Optional</span><input name="alertEmail" type="email" autoComplete="email" maxLength={254} /></label>
        <button className="primary access-action" disabled={busy}>{busy ? "Opening Stripe…" : "Continue to Stripe checkout →"}</button>
      </form>}
    </section>
  );
}

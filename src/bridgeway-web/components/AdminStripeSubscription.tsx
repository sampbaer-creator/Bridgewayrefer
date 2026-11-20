"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Subscription = {
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  dashboardUrl: string;
};

export default function AdminStripeSubscription({ businessId }: { businessId: string }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = "/api/admin/businesses/" + encodeURIComponent(businessId) + "/stripe";

  useEffect(() => {
    const controller = new AbortController();
    void api<Subscription>(endpoint, { signal: controller.signal })
      .then(setSubscription)
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [endpoint]);

  async function refresh() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSubscription(await api<Subscription>(endpoint));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load the subscription.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRenewal(cancelAtPeriodEnd: boolean) {
    const message = cancelAtPeriodEnd
      ? "Stop this subscription from renewing at the end of its current billing period?"
      : "Undo cancellation and allow Stripe to renew this subscription?";
    if (!window.confirm(message)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSubscription(await api<Subscription>(endpoint, { method: "PATCH", body: JSON.stringify({ cancelAtPeriodEnd }) }));
      setNotice(cancelAtPeriodEnd ? "Cancellation scheduled in Stripe." : "Cancellation undone in Stripe.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not update the subscription.");
    } finally {
      setBusy(false);
    }
  }

  const ended = subscription?.status === "canceled" || subscription?.status === "incomplete_expired";
  const date = subscription?.periodEnd ? new Date(subscription.periodEnd).toLocaleDateString() : null;

  return <section aria-label="Stripe subscription" className="admin-stripe-subscription">
    <h3>Stripe subscription</h3>
    {error && <p role="alert" className="error-message">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {subscription ? <>
      <p>Status <strong>{subscription.status.replaceAll("_", " ")}</strong>
        {!ended && date && <> · {subscription.cancelAtPeriodEnd ? "Ends" : "Current period ends"} {date}</>}
      </p>
      {subscription.cancelAtPeriodEnd && !ended && <p>Cancellation is scheduled. The business can be deleted after the subscription ends.</p>}
      <div className="billing-actions">
        {!ended && <button className="secondary" disabled={busy} onClick={() => void changeRenewal(!subscription.cancelAtPeriodEnd)}>
          {subscription.cancelAtPeriodEnd ? "Undo cancellation" : "Cancel at period end"}
        </button>}
        <button className="secondary" disabled={busy} onClick={() => void refresh()}>Refresh Stripe status</button>
        <a className="text-link" href={subscription.dashboardUrl} target="_blank" rel="noreferrer">Open in Stripe</a>
      </div>
    </> : error ? <button className="secondary" disabled={busy} onClick={() => void refresh()}>Retry Stripe status</button> : <p>Loading Stripe status…</p>}
  </section>;
}

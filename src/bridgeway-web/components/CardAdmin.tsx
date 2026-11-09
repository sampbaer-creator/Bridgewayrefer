"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";

type Business = { businessId: string; name: string };
type Choice = { id: string; name: string };
type Card = { id: string; officeName: string; partnerName?: string; url: string; active: boolean };
type Setup = { signupPending: boolean; offices: Choice[]; partners: Choice[]; cards: Card[] };

export default function CardAdmin() {
  const [businesses, setBusinesses] = useState<Business[]>();
  const [selected, setSelected] = useState("");
  const [setup, setSetup] = useState<Setup>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState<number>();
  const [notice, setNotice] = useState("");
  const endpoint = selected ? "/api/admin/businesses/" + encodeURIComponent(selected) + "/cards" : "";

  useEffect(() => {
    const controller = new AbortController();
    api<{ businesses: Business[] }>("/api/admin/businesses", { signal: controller.signal })
      .then(result => setBusinesses(result.businesses))
      .catch(failure => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError) setAuthError(failure.status);
        setError(failure instanceof Error ? failure.message : "Could not load businesses.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    api<Setup>(endpoint, { signal: controller.signal }).then(setSetup).catch(failure => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load this business.");
    });
    return () => controller.abort();
  }, [endpoint]);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const card = await api<Card>(endpoint, {
        method: "POST", body: JSON.stringify({ officeId: data.get("officeId"), partnerId: data.get("partnerId") }),
      });
      setSetup(previous => previous ? { ...previous, cards: [card, ...previous.cards] } : previous);
      setNotice("Card link issued. Copy the link to program the NFC card.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not issue a card.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Card link copied.");
    } catch {
      setNotice("Select the card URL to copy it manually.");
    }
  }

  return (
    <section className="card access-form" aria-label="Card assignments">
      {error && <p className="error-message" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {authError === 401 && <a className="access-action" href="/staff/login?flow=admin">Sign in as platform admin</a>}
      {!businesses && !error && <p role="status">Loading businesses…</p>}
      {businesses && (businesses.length === 0 ? <p>No businesses are available yet.</p> :
        <label>Company or practice
          <select value={selected} disabled={busy} onChange={event => {
            setSelected(event.target.value);
            setSetup(undefined);
            setNotice("");
            setError("");
          }}>
            <option value="">Choose a business</option>
            {businesses.map(b => <option key={b.businessId} value={b.businessId}>{b.name || b.businessId}</option>)}
          </select>
        </label>
      )}
      {selected && !setup && !error && <p role="status">Loading offices and cards…</p>}
      {setup?.signupPending && <p>This business is awaiting its first subscription payment.</p>}
      {setup && !setup.signupPending && (setup.offices.length === 0 ? <p>Add an active receiving office in the business dashboard first.</p> :
        <form key={selected} onSubmit={issue}>
          <label>Receiving office<select name="officeId" required defaultValue="">
            <option value="" disabled>Choose an office</option>
            {setup.offices.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}
          </select></label>
          <label>Referring partner<select name="partnerId">
            <option value="">Direct card</option>
            {setup.partners.map(partner => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
          </select></label>
          <button className="primary access-action" disabled={busy}>{busy ? "Issuing…" : "Issue card link"}</button>
        </form>
      )}
      {setup && <div className="issued-cards">
        <h2>Issued cards</h2>
        {!setup.cards.length && <p>No cards issued for this business yet.</p>}
        {setup.cards.map(card => <article key={card.id}>
          <h3>{card.officeName} · {card.partnerName || "Direct card"}</h3>
          <p>{card.active ? "Active" : "Inactive"} · Card ID <code>{card.id}</code></p>
          <a href={card.url}>{card.url}</a>
          <button className="secondary" onClick={() => void copy(card.url)}>Copy link</button>
        </article>)}
      </div>}
    </section>
  );
}

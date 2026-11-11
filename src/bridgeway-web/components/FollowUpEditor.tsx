"use client";
import { useState, type FormEvent } from "react";
import { api, type Referral } from "../lib/api";

function localDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function FollowUpEditor({ referral, onSaved }: { referral: Referral; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget), due = String(data.get("due") || "");
    try {
      await api(`/api/staff/referrals/${referral.id}/follow-up`, { method: "PATCH", body: JSON.stringify({ nextAction: data.get("action"), nextActionAt: due ? new Date(due).toISOString() : null, etag: referral.etag }) });
      await onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save follow-up."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="follow-up-form"><label>Next action<input name="action" maxLength={240} defaultValue={referral.nextAction || ""} placeholder="Call to confirm appointment" /></label><label>Follow-up due (your local time)<input type="datetime-local" name="due" defaultValue={localDate(referral.nextActionAt)} disabled={["Completed", "Won", "Closed"].includes(referral.status)} /></label><button className="secondary" disabled={busy}>{busy ? "Saving…" : "Save follow-up"}</button>{error && <p role="alert">{error}</p>}</form>;
}

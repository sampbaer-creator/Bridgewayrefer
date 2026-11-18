"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, statuses, type Referral, type ReferralHistory } from "../lib/api";
import FollowUpEditor from "./FollowUpEditor";
import { displayName, formatDateTime, type InboxMember } from "../lib/inbox";

type Props = {
  referral: Referral;
  members: InboxMember[];
  memberId: string | null;
  timeZone?: string;
  isAdmin: boolean;
  alertsEnabled: boolean;
  busy: boolean;
  onClose: () => void;
  onStatus: (referral: Referral, status: string) => void;
  onAssign: (referral: Referral, ownerId: string) => void;
  onSaved: () => Promise<void>;
  onNotify: (id: string) => void;
};

/** Side panel for one referral. A real modal outside the table, so focus is trapped while open and returns to the row on close. */
export default function ReferralDrawer({ referral: r, members, memberId, timeZone, isAdmin, alertsEnabled, busy, onClose, onStatus, onAssign, onSaved, onNotify }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const [history, setHistory] = useState<ReferralHistory[] | null>(null), [historyError, setHistoryError] = useState("");
  const request = useRef(0);

  const loadHistory = useCallback(async () => {
    const id = ++request.current; setHistoryError("");
    try {
      const result = await api<{ history: ReferralHistory[] }>(`/api/staff/referrals/${encodeURIComponent(r.id)}/history`);
      if (id === request.current) setHistory(result.history);
    } catch (failure) {
      if (id === request.current) setHistoryError(failure instanceof Error ? failure.message : "History could not be loaded.");
    }
  }, [r.id]);

  useEffect(() => {
    opener.current = document.activeElement;
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    return () => { if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus(); };
  }, []);
  // Reload history whenever the record changes (a status change adds an entry).
  useEffect(() => { void loadHistory(); }, [loadHistory, r.etag]);

  const name = displayName(r);
  const terminal = ["Completed", "Won", "Closed"].includes(r.status);
  const phone = r.phone?.replace(/[^+\d]/g, "");

  return <dialog ref={dialog} className="referral-drawer" aria-labelledby="referral-drawer-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="referral-drawer-body">
      <header className="referral-drawer-header">
        <div><p className="eyebrow">REFERRAL</p><h2 id="referral-drawer-title">{name}</h2><p className="muted">Received {formatDateTime(r.createdAt, timeZone)}</p></div>
        <button type="button" className="secondary" onClick={onClose}>Close<span className="sr-only"> details</span></button>
      </header>

      <div className="referral-drawer-contact">
        {phone && <a className="bw-contact-action" href={"tel:" + phone}><span aria-hidden="true">☎</span> Call {r.phone}</a>}
        {r.email && <a className="bw-contact-action" href={"mailto:" + encodeURIComponent(r.email)}><span aria-hidden="true">✉</span> Email {r.email}</a>}
      </div>

      <dl className="referral-drawer-facts">
        <div><dt>Referring partner</dt><dd>{r.partnerName || r.doctorName || "Direct request"}</dd></div>
        {r.serviceType && <div><dt>Service</dt><dd>{r.serviceType}</dd></div>}
        {r.postalCode && <div><dt>Postal code</dt><dd>{r.postalCode}</dd></div>}
      </dl>

      <div className="referral-drawer-controls">
        <label htmlFor={`detail-status-${r.id}`}>Status
          <select id={`detail-status-${r.id}`} value={r.status} disabled={busy} onChange={event => onStatus(r, event.target.value)}>{statuses.map(s => <option key={s}>{s}</option>)}</select>
        </label>
        <label htmlFor={`detail-owner-${r.id}`}>Owner
          <select id={`detail-owner-${r.id}`} value={r.ownerId || ""} disabled={busy} onChange={event => onAssign(r, event.target.value)}><option value="">Unassigned</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </label>
        {memberId && r.ownerId !== memberId && members.some(m => m.id === memberId) && <button type="button" className="secondary" disabled={busy} onClick={() => onAssign(r, memberId)}>Assign to me</button>}
      </div>

      {r.notes && <section className="referral-drawer-notes"><h3>Notes from the referral</h3><p>{r.notes}</p></section>}

      <section className="referral-drawer-followup">
        <h3>Next step</h3>
        {terminal ? <p className="muted">This referral is {r.status.toLowerCase()}. Change the status to schedule more follow-up.</p> : <FollowUpEditor key={r.id + r.etag} referral={r} onSaved={onSaved} />}
        {r.nextActionAt && !terminal && <p className="muted">Due {formatDateTime(r.nextActionAt, timeZone)}</p>}
        {isAdmin && <button type="button" className="secondary" disabled={!alertsEnabled || busy} onClick={() => onNotify(r.id)}>Queue missing staff notification</button>}
      </section>

      <section className="referral-history">
        <h3>Status history</h3>
        {historyError ? <div role="alert" className="notice">{historyError} <button type="button" className="secondary" onClick={() => void loadHistory()}>Retry history</button></div>
          : !history ? <p role="status">Loading history…</p>
          : history.length ? <ol>{history.map((item, index) => <li key={index}>{item.status} · {formatDateTime(item.changedAt, timeZone)} · {item.actor}</li>)}</ol>
          : <p>No status changes yet.</p>}
      </section>
    </div>
  </dialog>;
}

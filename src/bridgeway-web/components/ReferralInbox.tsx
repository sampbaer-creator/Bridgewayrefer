"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, statuses, type Partner, type Referral, type ReferralTotals } from "../lib/api";
import { activeView, displayName, emptyFilters, formatDate, formatDateTime, hasRefinements, isTerminal, nextStep, urgency, views, type InboxFilters, type InboxMember } from "../lib/inbox";
import ReferralDrawer from "./ReferralDrawer";

type Card = { id: string; officeName: string };
type Props = {
  referrals: Referral[];
  totals: ReferralTotals | null;
  members: InboxMember[];
  partners: Partner[];
  cards: Card[];
  memberId: string | null;
  isAdmin: boolean;
  alertsEnabled: boolean;
  timeZone?: string;
  filters: InboxFilters;
  onFilters: (next: InboxFilters) => void;
  loading: boolean;
  refreshing: boolean;
  updated: string;
  limited: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => Promise<void>;
  onError: (failure: unknown) => void;
  onNotify: (id: string) => void;
  setupHref?: string;
};
type Change = { kind: "status"; id: string; from: string; to: string } | { kind: "owner"; id: string; from: string; to: string };
type Toast = { message: string; undo?: Change[] };
type Pending = { title: string; detail: string; confirm: string; run: () => Promise<void> } | null;

const sum = (totals: ReferralTotals | null) => totals ? Object.values(totals.byStatus).reduce((total, n) => total + n, 0) : null;

export default function ReferralInbox(props: Props) {
  const { referrals, totals, members, partners, cards, memberId, isAdmin, filters, onFilters, timeZone } = props;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [active, setActive] = useState(-1);
  const [showKeys, setShowKeys] = useState(false);
  const latest = useRef(referrals); latest.current = referrals;
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const confirmRef = useRef<HTMLDialogElement>(null), keysRef = useRef<HTMLDialogElement>(null);
  const view = activeView(filters);
  const isMember = !!memberId && members.some(m => m.id === memberId);
  const memberName = (id: string) => members.find(m => m.id === id)?.name || "";

  // Selection only makes sense for rows on screen; drop it when the result set changes.
  const filterKey = JSON.stringify(filters);
  useEffect(() => { setSelected(new Set()); setActive(-1); }, [filterKey]);
  useEffect(() => { setSelected(current => { const ids = new Set(referrals.map(r => r.id)); const next = new Set([...current].filter(id => ids.has(id))); return next.size === current.size ? current : next; }); }, [referrals]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { const node = confirmRef.current; if (!node) return; if (pending && !node.open) node.showModal(); if (!pending && node.open) node.close(); }, [pending]);
  useEffect(() => { const node = keysRef.current; if (!node) return; if (showKeys && !node.open) node.showModal(); if (!showKeys && node.open) node.close(); }, [showKeys]);

  const say = useCallback((message: string, undo?: Change[]) => {
    clearTimeout(toastTimer.current); setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 10000 : 5000);
  }, []);
  const set = (patch: Partial<InboxFilters>) => onFilters({ ...filters, ...patch });

  /** Apply one change against the freshest etag we hold. Conflicts reload the inbox with a plain explanation. */
  async function apply(change: Change) {
    const row = latest.current.find(r => r.id === change.id);
    if (!row) throw new Error("This referral is no longer loaded. Refresh and try again.");
    if (change.kind === "status") await api(`/api/staff/referrals/${encodeURIComponent(row.id)}`, { method: "PATCH", body: JSON.stringify({ status: change.to, etag: row.etag }) });
    else await api(`/api/staff/referrals/${encodeURIComponent(row.id)}/assignment`, { method: "PATCH", body: JSON.stringify({ ownerId: change.to || null, ownerName: memberName(change.to) || null, etag: row.etag }) });
  }
  async function run(changes: Change[], done: (count: number) => string, undoable: boolean) {
    if (!changes.length) return;
    setBusy(true); setToast(null);
    let ok = 0; const applied: Change[] = []; let conflict = "", failure: unknown = null;
    for (const change of changes) {
      try { await apply(change); ok++; applied.push(change); }
      catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { props.onError(error); setBusy(false); return; }
        if (error instanceof ApiError && error.status === 409) conflict = displayName(latest.current.find(r => r.id === change.id) || ({ name: "a referral" } as Referral));
        else failure = error;
      }
    }
    await props.onRefresh();
    setBusy(false);
    if (conflict) say(`${conflict} was changed by someone else a moment ago. The inbox is reloaded; check it and try again.${ok ? ` ${done(ok)}` : ""}`);
    else if (failure) { props.onError(failure); if (ok) say(done(ok)); }
    else say(done(ok), undoable ? applied.map(c => ({ ...c, from: c.to, to: c.from })) : undefined);
  }
  async function undo(changes: Change[]) {
    await run(changes, count => count === 1 ? "Change undone." : `${count} changes undone.`, false);
  }

  function changeStatus(rows: Referral[], status: string) {
    const changes: Change[] = rows.filter(r => r.status !== status).map(r => ({ kind: "status", id: r.id, from: r.status, to: status }));
    if (!changes.length) return;
    const message = (n: number) => n === 1 ? `${displayName(rows.find(r => r.id === changes[0].id)!)} marked ${status}.` : `${n} referrals marked ${status}.`;
    // Closing out a referral clears its follow-up deadline on the server, so it gets a confirmation instead of an undo.
    if (isTerminal(status)) setPending({ title: `Mark ${changes.length === 1 ? "this referral" : `${changes.length} referrals`} ${status}?`, detail: "Any scheduled follow-up is cleared and it leaves the needs-attention list. You can reopen it later by changing the status.", confirm: `Mark ${status}`, run: () => run(changes, message, false) });
    else void run(changes, message, true);
  }
  function assign(rows: Referral[], ownerId: string) {
    const changes: Change[] = rows.filter(r => (r.ownerId || "") !== ownerId).map(r => ({ kind: "owner", id: r.id, from: r.ownerId || "", to: ownerId }));
    const who = ownerId ? (ownerId === memberId ? "you" : memberName(ownerId)) : "nobody";
    void run(changes, n => ownerId ? `${n === 1 ? displayName(rows[0]) : `${n} referrals`} assigned to ${who}.` : `${n === 1 ? displayName(rows[0]) : `${n} referrals`} unassigned.`, true);
  }

  const selectedRows = useMemo(() => referrals.filter(r => selected.has(r.id)), [referrals, selected]);
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allChecked = referrals.length > 0 && selected.size === referrals.length, someChecked = selected.size > 0 && !allChecked;
  const selectAll = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = someChecked; }, [someChecked]);
  const detail = referrals.find(r => r.id === detailId);

  // Keyboard triage, in the style of support inboxes: j/k move, x selects, Enter opens, a assigns to me, ? lists keys.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || detailId || pending) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, select, textarea, [contenteditable=true], dialog")) return;
      const rows = latest.current; if (!rows.length && event.key !== "?") return;
      const focusRow = (index: number) => { setActive(index); requestAnimationFrame(() => document.getElementById(`row-open-${rows[index]?.id}`)?.focus()); };
      const current = rows[active];
      if (event.key === "j") { event.preventDefault(); focusRow(Math.min(rows.length - 1, active + 1)); }
      else if (event.key === "k") { event.preventDefault(); focusRow(Math.max(0, active - 1)); }
      else if (event.key === "x" && current) { event.preventDefault(); toggle(current.id); }
      else if (event.key === "a" && current && isMember && memberId) { event.preventDefault(); assign([current], memberId); }
      else if (event.key === "?") { event.preventDefault(); setShowKeys(true); }
      else if (event.key === "Escape" && selected.size) { event.preventDefault(); setSelected(new Set()); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const total = sum(totals);
  const refined = hasRefinements(filters);
  const location = (r: Referral) => cards.find(card => card.id === (r.cardId || r.doctorCode))?.officeName || "";

  return <section className="inbox-section" id="inbox" aria-labelledby="inbox-title">
    <div className="section-heading">
      <div><p className="eyebrow">TO FOLLOW UP</p><h2 id="inbox-title">Referral inbox</h2><p className="muted">Newest first. Press <kbd>?</kbd> for keyboard shortcuts.</p></div>
      <div className="staff-inbox-heading-actions"><button className="secondary" onClick={() => void props.onRefresh()} disabled={props.refreshing}>{props.refreshing ? "Refreshing…" : <>Refresh inbox<span aria-hidden="true"> ↻</span></>}</button></div>
    </div>

    <nav className="inbox-views" aria-label="Inbox views">
      {views.filter(v => v.id !== "mine" || isMember).map(v => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => set({ ...v.filters, status: "" })}>
        {v.label}{v.id === "attention" && totals ? <b>{totals.needsAttention}</b> : null}
      </button>)}
    </nav>

    <div className="metrics" role="group" aria-label="Filter by status">{["", ...statuses].map(status => <button key={status} className="metric" aria-pressed={filters.status === status} aria-controls="referrals" onClick={() => set({ status })}>{status || "Any status"}<b>{totals ? status ? totals.byStatus[status] ?? 0 : total : "—"}</b></button>)}</div>

    <div className="staff-inbox-controls">
      <label className="staff-inbox-search" htmlFor="inbox-search">Search<input id="inbox-search" type="search" value={filters.q} onChange={e => set({ q: e.target.value })} placeholder="Name, email, phone, partner" /></label>
      <details className="staff-inbox-filters" open={refined || undefined}>
        <summary>Filters <span>{referrals.length}{total !== null && total > referrals.length ? ` of ${total}` : ""} shown{props.updated ? ` · Updated ${props.updated}` : ""}</span></summary>
        <div className="staff-inbox-filter-content"><div className="followup-toolbar">
          <label htmlFor="partner-filter">Partner<select id="partner-filter" value={filters.partner} onChange={e => set({ partner: e.target.value })}><option value="">All partners</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label htmlFor="owner-filter">Owner<select id="owner-filter" value={filters.owner} onChange={e => set({ owner: e.target.value })}><option value="">Anyone</option>{isMember && <option value="me">Me</option>}<option value="unassigned">Unassigned</option>{members.filter(m => m.id !== memberId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label htmlFor="received-from">Received from<input id="received-from" type="date" value={filters.from} onChange={e => set({ from: e.target.value })} /></label>
          <label htmlFor="received-to">Received to<input id="received-to" type="date" value={filters.to} onChange={e => set({ to: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={filters.unresolved} onChange={e => set({ unresolved: e.target.checked })} />Open referrals only</label>
        </div><p className="hint">Received dates use UTC calendar days.</p></div>
      </details>
      <button type="button" className="secondary" disabled={!refined && view === "all"} onClick={() => onFilters(emptyFilters)}>Clear filters</button>
    </div>

    {props.limited && <p className="notice">Showing {referrals.length} of {total ?? "more"} matching referrals. Load more below.</p>}

    {selected.size > 0 && <div className="inbox-bulk-bar" role="region" aria-label="Bulk actions">
      <strong>{selected.size} selected</strong>
      {isMember && memberId && <button type="button" className="secondary" disabled={busy} onClick={() => assign(selectedRows, memberId)}>Assign to me</button>}
      <label htmlFor="bulk-owner"><span className="sr-only">Assign selected to</span><select id="bulk-owner" value="" disabled={busy} onChange={e => { if (e.target.value) assign(selectedRows, e.target.value === "none" ? "" : e.target.value); }}><option value="">Assign to…</option><option value="none">Nobody (unassign)</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label htmlFor="bulk-status"><span className="sr-only">Change status of selected</span><select id="bulk-status" value="" disabled={busy} onChange={e => { if (e.target.value) changeStatus(selectedRows, e.target.value); }}><option value="">Set status…</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>
      <button type="button" className="secondary" onClick={() => setSelected(new Set())}>Cancel</button>
    </div>}

    <div className="referrals staff-referrals" id="referrals" aria-busy={busy || props.refreshing}>
      {!referrals.length ? <div className="inbox-empty">
        {props.loading ? <p role="status">Loading referrals…</p>
          : refined || view !== "all" ? <><p>No referrals match {view && view !== "all" && !refined ? `“${views.find(v => v.id === view)?.label}”` : "these filters"}.</p><button type="button" className="secondary" onClick={() => onFilters(emptyFilters)}>Show all referrals</button></>
          : <><p>No incoming referrals yet.</p><p className="muted">They appear here as soon as someone taps a partner card and submits the form.{props.setupHref && <> <a href={props.setupHref}>Check your workspace setup</a> or send a test referral.</>}</p></>}
      </div> : <div className="staff-referral-table-wrap"><table className="staff-referral-table inbox-table">
        <thead><tr>
          <th scope="col" className="inbox-select"><input ref={selectAll} type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(referrals.map(r => r.id)))} aria-label={allChecked ? "Deselect all loaded referrals" : "Select all loaded referrals"} /></th>
          <th scope="col">Referral</th><th scope="col">From</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Next step</th>
        </tr></thead>
        <tbody>{referrals.map((r, index) => {
          const name = displayName(r), u = urgency(r), phone = r.phone?.replace(/[^+\d]/g, "");
          return <tr key={r.id} className={`staff-referral-primary-row${selected.has(r.id) ? " is-selected" : ""}${index === active ? " is-active" : ""}`}>
            <td className="inbox-select"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${name}`} /></td>
            <th scope="row">
              <h3 className="staff-referral-name">{name}</h3>
              {u.state !== "ok" && u.state !== "done" && <span className={`staff-badge is-${u.state}`}>{u.label}</span>}
              <small className="staff-referral-meta">Received {formatDate(r.createdAt, timeZone)}</small>
              <span className="inbox-row-actions">
                <button id={`row-open-${r.id}`} type="button" className="staff-inline-detail-toggle" aria-haspopup="dialog" onFocus={() => setActive(index)} onClick={() => { setActive(index); setDetailId(r.id); }}>Contact &amp; history<span className="sr-only"> for {name}</span></button>
                {phone && <a href={"tel:" + phone} aria-label={`Call ${name}`} title={`Call ${r.phone}`}><span aria-hidden="true">☎</span></a>}
                {r.email && <a href={"mailto:" + encodeURIComponent(r.email)} aria-label={`Email ${name}`} title={r.email}><span aria-hidden="true">✉</span></a>}
              </span>
            </th>
            <td data-label="From">{r.partnerName || r.doctorName || "Direct request"}{location(r) && <small className="staff-referral-meta">to {location(r)}</small>}</td>
            <td data-label="Owner">
              <label className="sr-only" htmlFor={`owner-${r.id}`}>Owner for {name}</label>
              <select id={`owner-${r.id}`} className="staff-referral-status" value={r.ownerId || ""} disabled={busy} onChange={e => assign([r], e.target.value)}><option value="">Unassigned</option>{members.map(m => <option key={m.id} value={m.id}>{m.id === memberId ? `${m.name} (me)` : m.name}</option>)}</select>
              {isMember && memberId && !r.ownerId && <button type="button" className="inbox-link-button" disabled={busy} onClick={() => assign([r], memberId)}>Assign to me</button>}
            </td>
            <td data-label="Status"><label className="sr-only" htmlFor={`status-${r.id}`}>Status for {name}</label><select id={`status-${r.id}`} className="staff-referral-status" value={r.status} disabled={busy} onChange={e => changeStatus([r], e.target.value)}>{statuses.map(s => <option key={s}>{s}</option>)}</select></td>
            <td data-label="Next step"><div>{nextStep(r)}{u.due && u.state !== "done" && <small className={`staff-referral-meta inbox-due is-${u.state}`}><time dateTime={u.due.toISOString()}>{r.nextActionAt ? "Due" : "Contact by"} {formatDateTime(u.due, timeZone)}</time></small>}</div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </div>
    {props.hasMore && <div className="pagination"><button className="secondary" disabled={props.refreshing || props.loadingMore} onClick={props.onLoadMore}>{props.loadingMore ? "Loading…" : "Load more referrals"}</button></div>}

    <div className="inbox-toast" role="status" aria-live="polite">{toast && <><span>{toast.message}</span>{toast.undo && <button type="button" className="secondary" disabled={busy} onClick={() => { const changes = toast.undo!; setToast(null); void undo(changes); }}>Undo</button>}<button type="button" className="inbox-toast-close" aria-label="Dismiss message" onClick={() => setToast(null)}>×</button></>}</div>

    <dialog ref={confirmRef} className="inbox-confirm" aria-labelledby="inbox-confirm-title" onCancel={event => { event.preventDefault(); setPending(null); }}>
      {pending && <form method="dialog" onSubmit={event => { event.preventDefault(); const job = pending; setPending(null); void job.run(); }}>
        <h2 id="inbox-confirm-title">{pending.title}</h2><p>{pending.detail}</p>
        <div className="billing-actions"><button type="submit" className="primary">{pending.confirm}</button><button type="button" className="secondary" autoFocus onClick={() => setPending(null)}>Cancel</button></div>
      </form>}
    </dialog>

    <dialog ref={keysRef} className="inbox-confirm" aria-labelledby="inbox-keys-title" onCancel={event => { event.preventDefault(); setShowKeys(false); }}>
      <h2 id="inbox-keys-title">Keyboard shortcuts</h2>
      <dl className="inbox-keys"><div><dt><kbd>j</kbd> / <kbd>k</kbd></dt><dd>Next / previous referral</dd></div><div><dt><kbd>Enter</kbd></dt><dd>Open contact &amp; history</dd></div><div><dt><kbd>x</kbd></dt><dd>Select or deselect</dd></div>{isMember && <div><dt><kbd>a</kbd></dt><dd>Assign to me</dd></div>}<div><dt><kbd>Esc</kbd></dt><dd>Clear selection or close a panel</dd></div><div><dt><kbd>?</kbd></dt><dd>Show this list</dd></div></dl>
      <button type="button" className="secondary" autoFocus onClick={() => setShowKeys(false)}>Close</button>
    </dialog>

    {detail && <ReferralDrawer key={detail.id} referral={detail} members={members} memberId={memberId} timeZone={timeZone} isAdmin={isAdmin} alertsEnabled={props.alertsEnabled} busy={busy}
      onClose={() => setDetailId("")} onStatus={(row, status) => changeStatus([row], status)} onAssign={(row, owner) => assign([row], owner)} onSaved={props.onRefresh} onNotify={props.onNotify} />}
  </section>;
}

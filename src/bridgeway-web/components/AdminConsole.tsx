"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api, ApiError } from "../lib/api";

type AdminSession = { email: string; acceptingGlobally: boolean; smtpConfigured: boolean; stripeConfigured: boolean; monthlyPriceUsd: number };
type BusinessSummary = { businessId: string; name: string; createdAt: string; suspended: boolean; acceptReferrals: boolean; billingExempt: boolean; billingStatus: string; alertEmail: string; cards: number; taps: number; referrals: number; etag: string };
type Totals = { businesses: number; cards: number; taps: number; referrals: number };
type AdminCard = { id: string; label: string; partnerId: string; partnerName: string; officeName: string; active: boolean; createdAt: string; etag: string; url: string; taps: number; referrals: number };
type Detail = { business: BusinessSummary; cards: AdminCard[]; partners: { id: string; name: string; active: boolean }[]; offices: { id: string; name: string; active: boolean }[]; members: { email: string; role: string }[]; invitations: { email: string; role: string; expiresAt: string }[] };
type DemoRequest = { name: string; email: string; businessName: string; createdAt: string };

const paid = ["active", "trialing", "past_due"];
function liveState(b: BusinessSummary, session: AdminSession | null) {
  if (b.suspended) return "Suspended";
  if (!session?.acceptingGlobally) return "Intake closed globally";
  if (!b.acceptReferrals) return "Intake off";
  if (!b.billingExempt && !paid.includes(b.billingStatus)) return "Awaiting payment";
  return "Live";
}

export default function AdminConsole() {
  const [tab, setTab] = useState<"businesses" | "cards" | "create" | "leads">("businesses");
  const [state, setState] = useState<"loading" | "ready" | "signin" | "denied">("loading");
  const [session, setSession] = useState<AdminSession | null>(null), [businesses, setBusinesses] = useState<BusinessSummary[]>([]), [totals, setTotals] = useState<Totals | null>(null);
  const [selected, setSelected] = useState(""), [detail, setDetail] = useState<Detail | null>(null), [requests, setRequests] = useState<DemoRequest[]>([]);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(""), [issued, setIssued] = useState<{ label: string; url: string }[]>([]), [qr, setQr] = useState<{ id: string; data: string } | null>(null);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) setState("signin");
    else if (e instanceof ApiError && e.status === 403) setState("denied");
    else setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
  }, []);

  const loadList = useCallback(async () => {
    try {
      const [s, list, demo] = await Promise.all([api<AdminSession>("/api/admin/session"), api<{ businesses: BusinessSummary[]; totals: Totals }>("/api/admin/businesses"), api<{ requests: DemoRequest[] }>("/api/admin/demo-requests")]);
      setSession(s); setBusinesses(list.businesses.sort((a, b) => a.name.localeCompare(b.name))); setTotals(list.totals); setRequests(demo.requests); setState("ready");
    } catch (e) { fail(e); }
  }, [fail]);
  const loadDetail = useCallback(async (businessId: string) => {
    if (!businessId) { setDetail(null); return; }
    try { setDetail(await api<Detail>("/api/admin/businesses/" + encodeURIComponent(businessId))); } catch (e) { fail(e); }
  }, [fail]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { setIssued([]); setQr(null); void loadDetail(selected); }, [selected, loadDetail]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key); setError(""); setNotice("");
    try { await action(); } catch (e) { fail(e); } finally { setBusy(""); }
  }
  const refreshAll = async () => { await loadList(); await loadDetail(selected); };

  function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    void run("business", async () => {
      const created = await api<{ businessId: string; name: string; inviteUrl: string }>("/api/admin/businesses", { method: "POST", body: JSON.stringify({ name: data.get("name"), adminEmail: data.get("adminEmail"), alertEmail: data.get("alertEmail") || null, billingExempt: data.get("billingExempt") === "on" }) });
      form.reset(); setNotice(`${created.name} created. Send the business admin this sign-in link: ${created.inviteUrl}`); await loadList(); setSelected(created.businessId); setTab("cards");
    });
  }
  function updateBusiness(changes: { suspended?: boolean; billingExempt?: boolean; alertEmail?: string }) {
    if (!detail) return;
    void run("update", async () => { await api("/api/admin/businesses/" + detail.business.businessId, { method: "PATCH", body: JSON.stringify({ ...changes, etag: detail.business.etag }) }); setNotice("Business updated."); await refreshAll(); });
  }
  function saveAlert(event: FormEvent<HTMLFormElement>) { event.preventDefault(); updateBusiness({ alertEmail: String(new FormData(event.currentTarget).get("alertEmail") || "") }); }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return; const form = event.currentTarget; const data = new FormData(form);
    void run("invite", async () => { const result = await api<{ inviteUrl: string; email: string }>("/api/admin/businesses/" + detail.business.businessId + "/invitations", { method: "POST", body: JSON.stringify({ email: data.get("email"), role: data.get("role") }) }); form.reset(); setNotice(`Invite ready for ${result.email}. They sign in at ${result.inviteUrl}`); await loadDetail(selected); });
  }
  function issueCards(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return; const form = event.currentTarget; const data = new FormData(form);
    const partner = String(data.get("partnerId") || "");
    void run("cards", async () => {
      const result = await api<{ partnerName: string; cards: { id: string; label: string; url: string }[] }>("/api/admin/businesses/" + detail.business.businessId + "/cards", { method: "POST", body: JSON.stringify({ partnerId: partner && partner !== "__new" ? partner : null, partnerName: partner === "__new" ? data.get("partnerName") : null, officeId: data.get("officeId") || null, quantity: Number(data.get("quantity") || 1), label: data.get("label") || null }) });
      form.reset(); setIssued(result.cards); setNotice(`${result.cards.length} card link${result.cards.length === 1 ? "" : "s"} issued for ${result.partnerName}. Write each URL to an NFC tag.`); await refreshAll();
    });
  }
  function toggleCard(card: AdminCard) {
    void run(card.id, async () => { await api("/api/admin/cards/" + card.id, { method: "PATCH", body: JSON.stringify({ active: !card.active, etag: card.etag }) }); await loadDetail(selected); });
  }
  async function makeQr(card: AdminCard) { try { setQr({ id: card.id, data: await QRCode.toDataURL(card.url, { width: 320, margin: 1, errorCorrectionLevel: "M" }) }); } catch { setError("Could not create the QR code."); } }
  function copy(text: string) { void navigator.clipboard.writeText(text).then(() => setNotice("Copied.")).catch(() => setError("Copy unavailable. Select the text to copy it manually.")); }
  function downloadCsv() {
    if (!detail) return;
    const rows = [["label", "partner", "office", "url", "active"], ...detail.cards.map(c => [c.label, c.partnerName, c.officeName, c.url, String(c.active)])];
    const csv = rows.map(r => r.map(v => `"${(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `bridgewayrefer-cards-${detail.business.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  if (state === "signin") return <main className="dashboard" id="main-content"><section className="card session-expired"><h1>Platform admin sign-in</h1><p>Sign in with your Bridgewayrefer owner account.</p><a className="session-sign-in" href="/admin/login">Sign in</a></section></main>;
  if (state === "denied") return <main className="dashboard" id="main-content"><section className="card session-expired" role="alert"><h1>Access denied</h1><p>This account is not a Bridgewayrefer platform administrator.</p><a className="session-sign-in" href="/staff">Go to the staff dashboard</a></section></main>;

  const b = detail?.business;
  return <main className="dashboard dashboard-wide admin-workspace" id="main-content" aria-busy={state === "loading"}>
    <div className="dashboard-heading"><div><p className="eyebrow">BRIDGEWAYREFER PLATFORM WORKSPACE</p><h1>Businesses and NFC cards.</h1><p className="muted">Create workspaces, connect cards, and track partner outcomes.</p></div>
      <div className="workspace-actions"><label className="business-switcher-light" htmlFor="admin-workspace">Workspace<select id="admin-workspace" value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose a workspace…</option>{businesses.map(business => <option key={business.businessId} value={business.businessId}>{business.name}</option>)}</select></label><a className="text-link" href="/staff">Open staff dashboard →</a></div></div>
    <nav className="section-nav admin-tabs" aria-label="Admin sections">{([["businesses", "Businesses"], ["cards", "NFC cards"], ["create", "Create business"], ["leads", "Demo requests"]] as const).map(([key, label]) => <button type="button" key={key} aria-current={tab === key ? "page" : undefined} aria-controls={`admin-${key}`} onClick={() => setTab(key)}>{label}</button>)}</nav>
    <p className="error-message" role="alert">{error}</p><p className="hint" role="status">{notice}</p>
    {session && (!session.acceptingGlobally || !session.smtpConfigured || !session.stripeConfigured) && <p className="notice">{!session.acceptingGlobally && "Global intake is off (Bridgewayrefer__AcceptReferrals). "}{!session.smtpConfigured && "Email alerts are not configured (SMTP). "}{!session.stripeConfigured && "Stripe billing is not configured."}</p>}

    {totals && <div className="report-summary"><div className="summary-card summary-primary"><p>Businesses</p><strong>{totals.businesses}</strong><small>{businesses.filter(x => liveState(x, session) === "Live").length} live</small></div><div className="summary-card"><p>Card taps</p><strong>{totals.taps}</strong><small>{totals.cards} cards issued</small></div><div className="summary-card"><p>Referrals submitted</p><strong>{totals.referrals}</strong><small>{totals.taps ? Math.round(totals.referrals / totals.taps * 100) : 0}% of taps</small></div></div>}

    <section className="card" id="admin-businesses" hidden={tab !== "businesses"}><p className="eyebrow">ALL BUSINESSES</p><h2>Businesses</h2>
      <div className="table-scroll"><table className="office-table"><thead><tr><th>Business</th><th>Status</th><th>Billing</th><th>Cards</th><th>Taps</th><th>Referrals</th></tr></thead><tbody>
        {businesses.map(x => <tr key={x.businessId} onClick={() => { setSelected(x.businessId); setTab("cards"); }} style={{ cursor: "pointer", background: x.businessId === selected ? "#edf1f5" : undefined }}><td><button className="secondary" style={{ padding: "4px 8px" }} onClick={() => { setSelected(x.businessId); setTab("cards"); }}>{x.name}</button></td><td>{liveState(x, session)}</td><td>{x.billingExempt ? "Exempt" : x.billingStatus}</td><td>{x.cards}</td><td>{x.taps}</td><td>{x.referrals}</td></tr>)}
        {!businesses.length && <tr><td colSpan={6}>{state === "loading" ? "Loading…" : "No businesses yet. Create the first one below."}</td></tr>}
      </tbody></table></div>
    </section>

    {tab === "cards" && !b && <section className="card workspace-empty" id="admin-cards"><h2>Connect NFC cards</h2><p>Choose a workspace above to create referral links and connect them to NFC cards.</p><button type="button" onClick={() => setTab("create")}>Create a business</button></section>}
    {b && detail && <div className="management-grid" id="admin-cards" hidden={tab !== "cards"}>
      <section className="card"><p className="eyebrow">NFC CARDS</p><h2>{b.name}</h2><p className="muted">{liveState(b, session)} · {b.cards} cards · {b.taps} taps · {b.referrals} referrals</p>
        <form className="form-grid" onSubmit={issueCards}>
          <label htmlFor="card-partner">Referring partner<select id="card-partner" name="partnerId" required defaultValue=""><option value="" disabled>Choose partner</option>{detail.partners.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="__new">+ New partner…</option></select></label>
          <label htmlFor="card-partner-name">New partner name<input id="card-partner-name" name="partnerName" maxLength={120} placeholder="Only for a new partner"/></label>
          <label htmlFor="card-office">Receiving office<select id="card-office" name="officeId" defaultValue="">{detail.offices.filter(o => o.active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label htmlFor="card-quantity">How many cards<input id="card-quantity" name="quantity" type="number" min={1} max={50} defaultValue={1}/></label>
          <label className="span-two" htmlFor="card-label">Label<input id="card-label" name="label" maxLength={80} placeholder="e.g. Dr. Lee front desk"/></label>
          <button className="primary span-two" disabled={busy === "cards"}>{busy === "cards" ? "Issuing…" : "Issue card links"}</button>
        </form>
        {issued.length > 0 && <div className="notice"><strong>Write these URLs to NFC tags:</strong>{issued.map(c => <div className="card-row" key={c.url}><div><strong>{c.label || "Card"}</strong><small>{c.url}</small></div><button className="secondary" onClick={() => copy(c.url)}>Copy</button></div>)}<button className="secondary" onClick={() => copy(issued.map(c => c.url).join("\n"))}>Copy all</button></div>}
        <div className="section-heading" style={{ marginTop: 24 }}><p className="eyebrow">ISSUED CARDS</p>{detail.cards.length > 0 && <button className="secondary" onClick={downloadCsv}>Download CSV</button>}</div>
        <div className="partner-card-list">{detail.cards.map(card => <article className="card-row" key={card.id}><div><strong>{card.label ? card.label + " · " : ""}{card.partnerName} → {card.officeName}</strong><small>{card.active ? "Active" : "Inactive"} · {card.taps} taps · {card.referrals} referrals · {card.url}</small></div><div className="card-row-actions"><button className="secondary" onClick={() => copy(card.url)}>Copy link</button><button className="secondary" onClick={() => void makeQr(card)}>QR</button><button className="secondary" disabled={busy === card.id} onClick={() => toggleCard(card)}>{card.active ? "Deactivate" : "Activate"}</button></div>{qr?.id === card.id && <div className="qr-download"><img src={qr.data} alt={`QR code for ${card.partnerName}`}/><a href={qr.data} download={`bridgeway-${card.id}.png`}>Download QR PNG</a></div>}</article>)}{!detail.cards.length && <p className="empty">No cards yet.</p>}</div>
      </section>
      <div className="management-stack">
        <section className="card"><p className="eyebrow">ACCOUNT</p><h2>Controls</h2>
          <p className="muted">Billing: <b>{b.billingExempt ? "Exempt (comped)" : b.billingStatus}</b></p>
          <div className="billing-actions"><button className="secondary" disabled={busy === "update"} onClick={() => updateBusiness({ suspended: !b.suspended })}>{b.suspended ? "Reactivate business" : "Suspend business"}</button><button className="secondary" disabled={busy === "update"} onClick={() => updateBusiness({ billingExempt: !b.billingExempt })}>{b.billingExempt ? "Require payment" : "Mark billing exempt"}</button></div>
          <form className="inline" onSubmit={saveAlert}><label htmlFor="admin-alert">Alert email<input id="admin-alert" name="alertEmail" type="email" maxLength={254} defaultValue={b.alertEmail} key={b.etag}/></label><button className="secondary" disabled={busy === "update"}>Save</button></form>
        </section>
        <section className="card"><p className="eyebrow">ACCESS</p><h2>People</h2>
          <form className="inline" onSubmit={invite}><label htmlFor="admin-invite">Invite email<input id="admin-invite" name="email" type="email" required maxLength={254}/></label><label htmlFor="admin-invite-role">Role<select id="admin-invite-role" name="role"><option>Admin</option><option>Staff</option></select></label><button className="secondary" disabled={busy === "invite"}>Invite</button></form>
          <div className="partner-card-list">{detail.members.map(m => <div className="card-row" key={m.email}><strong>{m.email}</strong><small>{m.role}</small></div>)}{detail.invitations.map(i => <div className="card-row" key={i.email + i.expiresAt}><strong>{i.email}</strong><small>Invite pending · {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}</small></div>)}</div>
        </section>
      </div>
    </div>}

    <div className="admin-onboarding">
      <section className="card" id="admin-create" hidden={tab !== "create"}><p className="eyebrow">ONBOARD</p><h2>Create a business</h2><p className="muted">Creates the workspace and its main office, and invites the business admin.</p>
        <form className="form-grid" onSubmit={createBusiness}>
          <label htmlFor="new-name">Business name<input id="new-name" name="name" required maxLength={120}/></label>
          <label htmlFor="new-admin">Business admin email<input id="new-admin" name="adminEmail" type="email" required maxLength={254}/></label>
          <label htmlFor="new-alert">Alert email (optional)<input id="new-alert" name="alertEmail" type="email" maxLength={254} placeholder="Defaults to admin email"/></label>
          <label className="check span-two"><input type="checkbox" name="billingExempt"/><span>Billing exempt (pilot or comped account). Otherwise intake opens after they subscribe.</span></label>
          <button className="primary span-two" disabled={busy === "business"}>Create business</button>
        </form>
      </section>
      <section className="card" id="admin-leads" hidden={tab !== "leads"}><p className="eyebrow">LEADS</p><h2>Demo requests</h2><div className="partner-card-list">{requests.map(r => <div className="card-row" key={r.email + r.createdAt}><div><strong>{r.businessName}</strong><small>{r.name} · <a href={"mailto:" + r.email}>{r.email}</a> · {new Date(r.createdAt).toLocaleDateString()}</small></div></div>)}{!requests.length && <p className="empty">No demo requests yet.</p>}</div></section>
    </div>
  </main>;
}

"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api, ApiError, statuses, WORKSPACE_KEY, type Alerts, type Business, type Partner, type Referral, type ReferralHistory, type Report } from "../lib/api";
import OfficeReport from "./OfficeReport";

type Office = { id: string; name: string; active: boolean; etag: string };
type CardLink = { id: string; partnerId: string; partnerName: string; officeName: string; active: boolean; etag: string; url: string };
type Member = { id: string; name: string; email: string; role: string; etag: string };
type BusinessProfile = { name: string; officeName: string; preset: "dental" | "trades"; welcomeText: string; phone: string; logoUrl: string; acceptReferrals: boolean; accepting: boolean; suspended: boolean; alertEmail: string; billingStatus: string; monthlyPriceUsd: number; etag: string };
type Billing = { amountUsd: number; interval: string; status: string; billingExempt: boolean; renewalAt?: string; cancelAtPeriodEnd: boolean; configured: boolean; testMode: boolean; customerLinked: boolean };
type Invitation = { id: string; email: string; role: string; state: string; expiresAt: string; etag: string };
type Session = { platformAdmin?: boolean; businessId?: string | null; role: string; businesses: Business[] };

export default function StaffDashboard({ adminMode = false }: { adminMode?: boolean }) {
  const [referrals, setReferrals] = useState<Referral[]>([]), [partners, setPartners] = useState<Partner[]>([]), [offices, setOffices] = useState<Office[]>([]), [cards, setCards] = useState<CardLink[]>([]), [members, setMembers] = useState<Member[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]), [profile, setProfile] = useState<BusinessProfile | null>(null), [billing, setBilling] = useState<Billing | null>(null), [invitations, setInvitations] = useState<Invitation[]>([]), [alerts, setAlerts] = useState<Alerts | null>(null), [report, setReport] = useState<Report | null>(null);
  const [month, setMonth] = useState(""), [workspace, setWorkspace] = useState(""), [filter, setFilter] = useState(""), [partnerFilter, setPartnerFilter] = useState(""), [query, setQuery] = useState(""), [fromDate, setFromDate] = useState(""), [toDate, setToDate] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [updated, setUpdated] = useState(""), [limited, setLimited] = useState(false), [session, setSession] = useState<"loading" | "active" | "expired" | "denied">("loading"), [platformAdmin, setPlatformAdmin] = useState(false), [busy, setBusy] = useState(""), [refreshing, setRefreshing] = useState(false);
  const [detailId, setDetailId] = useState(""), [history, setHistory] = useState<Record<string, ReferralHistory[]>>({}), [qrCard, setQrCard] = useState<{ id: string; data: string } | null>(null), [inviteLink, setInviteLink] = useState("");
  const generation = useRef(0), stopped = useRef(false), selectedMonth = useRef(""), workspaceRef = useRef(""), loading = useRef<{ month: string; workspace: string; controller: AbortController } | null>(null);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      stopped.current = true; generation.current++; loading.current?.controller.abort(); setReferrals([]); setPartners([]); setOffices([]); setCards([]); setMembers([]); setReport(null); setAlerts(null); setSession(e.status === 401 ? "expired" : "denied");
    } else setError(e instanceof Error ? e.message : "Service unavailable. Please try again.");
  }, []);

  const refresh = useCallback(async () => {
    const requestMonth = selectedMonth.current, requestWorkspace = workspaceRef.current;
    if (stopped.current || (loading.current?.month === requestMonth && loading.current.workspace === requestWorkspace && !loading.current.controller.signal.aborted)) return;
    loading.current?.controller.abort();
    const controller = new AbortController(), request = ++generation.current;
    loading.current = { month: requestMonth, workspace: requestWorkspace, controller }; setRefreshing(true);
    const current = () => request === generation.current && !stopped.current && !controller.signal.aborted && requestMonth === selectedMonth.current && requestWorkspace === workspaceRef.current;
    const options = { signal: controller.signal };
    try {
      const auth = await api<Session & { ok: boolean }>("/api/staff/session", options);
      if (!current()) return;
      const available = auth.businesses || []; setBusinesses(available); setPlatformAdmin(!!auth.platformAdmin); setSession("active");
      if (!auth.businessId && requestWorkspace && !available.some(b => b.businessId === requestWorkspace)) {
        workspaceRef.current = ""; localStorage.removeItem(WORKSPACE_KEY); setWorkspace(""); setReferrals([]); setReport(null); return;
      }
      if (auth.businessId && auth.businessId !== workspaceRef.current) {
        workspaceRef.current = auth.businessId; localStorage.setItem(WORKSPACE_KEY, auth.businessId); setWorkspace(auth.businessId);
      }
      if (!auth.businessId) { setReferrals([]); setReport(null); setError(""); return; }
      if (available.find(b => b.businessId === auth.businessId)?.signupPending) {
        setReferrals([]);
        setReport(null);
        const pendingBilling = await api<Billing>("/api/staff/billing", options);
        if (current()) { setBilling(pendingBilling); setError(""); }
        return;
      }
      const admin = auth.role === "Admin";
      const inbox = await api<{ referrals: Referral[]; limited: boolean }>("/api/staff/referrals", options);
      if (!current()) return;
      setReferrals(inbox.referrals); setLimited(inbox.limited); setUpdated(new Date().toLocaleTimeString()); setError("");

      const panelResults = await Promise.allSettled([
        api<{ partners: Partner[] }>("/api/staff/partners", options), api<{ offices: Office[] }>("/api/staff/offices", options), api<{ cards: CardLink[] }>("/api/staff/cards", options), api<{ members: Member[] }>("/api/staff/members", options), api<BusinessProfile>("/api/staff/business/profile", options), api<Billing>("/api/staff/billing", options), api<Alerts>("/api/staff/alerts", options), admin ? api<{ invitations: Invitation[] }>("/api/staff/invitations", options) : Promise.resolve({ invitations: [] }),
      ]);
      if (!current()) return;
      const [partnerData, officeData, cardData, memberData, profileData, billingData, alertData, inviteData] = panelResults;
      if (partnerData.status === "fulfilled") setPartners(partnerData.value.partners);
      if (officeData.status === "fulfilled") setOffices(officeData.value.offices);
      if (cardData.status === "fulfilled") setCards(cardData.value.cards);
      if (memberData.status === "fulfilled") setMembers(memberData.value.members);
      if (profileData.status === "fulfilled") setProfile(profileData.value);
      if (billingData.status === "fulfilled") setBilling(billingData.value);
      if (alertData.status === "fulfilled") setAlerts(alertData.value);
      if (inviteData.status === "fulfilled") setInvitations(inviteData.value.invitations);
      const panelError = panelResults.find(result => result.status === "rejected");
      if (panelError?.status === "rejected" && panelError.reason instanceof ApiError && (panelError.reason.status === 401 || panelError.reason.status === 403)) { handleError(panelError.reason); return; }

      try {
        const analytics = await api<Report>("/api/staff/analytics" + (requestMonth ? "?month=" + requestMonth : ""), options);
        if (current()) { setReport(analytics); if (!panelError) setError(""); else setError("The inbox is available, but some optional dashboard panels could not be loaded."); }
      } catch (e) {
        if (current()) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) handleError(e);
          else setError(e instanceof Error ? e.message : "Analytics could not be loaded. The inbox remains available.");
        }
      }
    } catch (e) { if (current()) handleError(e); }
    finally { if (loading.current?.controller === controller) { loading.current = null; setRefreshing(false); } }
  }, [handleError]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search), invitedWorkspace = params.get("workspace"), storedWorkspace = localStorage.getItem(WORKSPACE_KEY) || "";
    const initial = invitedWorkspace || storedWorkspace; workspaceRef.current = initial;
    if (initial) { localStorage.setItem(WORKSPACE_KEY, initial); setWorkspace(initial); }
  }, []);
  useEffect(() => {
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(visibleRefresh, 60000);
    document.addEventListener("visibilitychange", visibleRefresh); window.addEventListener("focus", visibleRefresh); window.addEventListener("pageshow", visibleRefresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibleRefresh); window.removeEventListener("focus", visibleRefresh); window.removeEventListener("pageshow", visibleRefresh); generation.current++; loading.current?.controller.abort(); loading.current = null; };
  }, [month, workspace, refresh]);

  function selectMonth(value: string) { if (value === selectedMonth.current) return; selectedMonth.current = value; generation.current++; loading.current?.controller.abort(); setMonth(value); }
  function selectWorkspace(value: string) {
    workspaceRef.current = value; generation.current++; loading.current?.controller.abort(); setWorkspace(value); setSession("loading"); setError(""); setReferrals([]); setReport(null); setPartners([]); setCards([]); setOffices([]); setMembers([]); setProfile(null); setBilling(null); setAlerts(null);
    if (value) localStorage.setItem(WORKSPACE_KEY, value); else localStorage.removeItem(WORKSPACE_KEY);
  }
  async function changeStatus(referral: Referral, status: string) {
    setBusy(referral.id); setError("");
    try { await api("/api/staff/referrals/" + referral.id, { method: "PATCH", body: JSON.stringify({ status, etag: referral.etag }) }); await refresh(); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function assign(referral: Referral, owner: Member | undefined) {
    setBusy("owner-" + referral.id); setError("");
    try { await api("/api/staff/referrals/" + referral.id + "/assignment", { method: "PATCH", body: JSON.stringify({ ownerId: owner?.id || null, ownerName: owner?.name || null, etag: referral.etag }) }); await refresh(); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function showHistory(referralId: string) {
    if (detailId === referralId) { setDetailId(""); return; }
    setDetailId(referralId);
    if (history[referralId]) return;
    try { const result = await api<{ history: ReferralHistory[] }>("/api/staff/referrals/" + referralId + "/history"); setHistory(current => ({ ...current, [referralId]: result.history })); }
    catch (e) { handleError(e); }
  }
  async function createPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setBusy("partner"); setError("");
    try { await api("/api/staff/partners", { method: "POST", body: JSON.stringify({ name: new FormData(form).get("name") }) }); form.reset(); await refresh(); setNotice("Partner added."); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function createOffice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setBusy("office"); setError("");
    try { await api("/api/staff/offices", { method: "POST", body: JSON.stringify({ name: new FormData(form).get("name") }) }); form.reset(); await refresh(); setNotice("Office added."); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy("invite"); setError("");
    try { const result = await api<{ inviteUrl: string }>("/api/staff/invitations", { method: "POST", body: JSON.stringify({ email: data.get("email"), role: data.get("role") }) }); form.reset(); setNotice("Invite link ready. Share it with the invited email address."); setInviteLink(result.inviteUrl); await refresh(); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function revokeMember(member: Member) {
    if (!window.confirm(`Revoke ${member.email || member.name}'s access to this workspace?`)) return;
    setBusy("member-" + member.id); setError("");
    try { await api("/api/staff/members/" + encodeURIComponent(member.id), { method: "PATCH", body: JSON.stringify({ active: false, etag: member.etag }) }); setNotice("Member access revoked."); await refresh(); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function cancelInvitation(invitation: Invitation) {
    setBusy("invite-" + invitation.id); setError("");
    try { await api("/api/staff/invitations/" + encodeURIComponent(invitation.id), { method: "DELETE", body: JSON.stringify({ etag: invitation.etag }) }); setNotice("Invitation canceled."); await refresh(); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!profile) return; const data = new FormData(event.currentTarget); setBusy("profile"); setError("");
    try { await api("/api/staff/business/profile", { method: "PATCH", body: JSON.stringify({ name: data.get("name"), preset: data.get("preset"), welcomeText: data.get("welcomeText"), phone: data.get("phone"), logoUrl: data.get("logoUrl"), alertEmail: data.get("alertEmail"), acceptReferrals: data.get("acceptReferrals") === "on", etag: profile.etag }) }); setNotice("Business settings saved."); await refresh(); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function subscribe() { setBusy("billing"); setError(""); try { const response = await api<{ url: string }>("/api/staff/billing/checkout", { method: "POST", body: "{}" }); window.location.assign(response.url); } catch (e) { handleError(e); setBusy(""); } }
  async function manageBilling() { setBusy("billing"); setError(""); try { const response = await api<{ url: string }>("/api/staff/billing/portal", { method: "POST", body: "{}" }); window.location.assign(response.url); } catch (e) { handleError(e); setBusy(""); } }
  async function makeQr(card: CardLink) { try { setQrCard({ id: card.id, data: await QRCode.toDataURL(card.url, { width: 320, margin: 1, errorCorrectionLevel: "M" }) }); } catch { setError("Could not create the QR code. Copy the link instead."); } }
  async function testAlert() { setBusy("alert"); setNotice(""); try { await api("/api/staff/alerts/test", { method: "POST", body: "{}" }); setNotice("Test alert queued."); } catch (e) { handleError(e); } finally { setBusy(""); } }

  const selectedBusiness = businesses.find(b => b.businessId === workspace), isAdmin = selectedBusiness?.role === "Admin";
  const allowedStatuses = selectedBusiness?.preset === "trades" ? ["New", "Contacted", "Quoted", "Won", "Closed"] : statuses.filter(s => !["Quoted", "Won"].includes(s));
  const selectedReport = report && (report.month === month || !month) ? report : null;
  const filtered = useMemo(() => referrals.filter(r => (!filter || r.status === filter) && (!partnerFilter || (r.partnerId || r.doctorCode) === partnerFilter) && (!query || `${r.name} ${r.partnerName || r.doctorName} ${r.email} ${r.phone}`.toLowerCase().includes(query.toLowerCase())) && (!fromDate || r.createdAt.slice(0, 10) >= fromDate) && (!toDate || r.createdAt.slice(0, 10) <= toDate)).sort((a, b) => {
    const overdue = (r: Referral) => !["Completed", "Won", "Closed"].includes(r.status) && Date.now() - Date.parse(r.createdAt) > 48 * 60 * 60 * 1000;
    const priority = (r: Referral) => r.status === "New" ? 0 : !r.ownerId ? 1 : overdue(r) ? 2 : 3;
    return priority(a) - priority(b) || (priority(a) < 3 ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }), [referrals, filter, partnerFilter, query, fromDate, toDate]);

  if (session === "expired" || session === "denied") return <main className="dashboard" id="main-content"><section className="card session-expired" role="alert"><h1>{session === "expired" ? "Please sign in again" : "Access denied"}</h1><p>{session === "expired" ? "Your staff session has ended. Sign in to continue." : "Your account does not have active access to this workspace. Contact its administrator."}</p><a className="session-sign-in" href="/staff/login">Sign in to the office dashboard</a></section></main>;
  if (session === "active" && !businesses.length) return <main className="dashboard" id="main-content"><section className="card no-workspace"><p className="eyebrow">STAFF ACCESS</p><h1>Workspace invitation required</h1><p className="muted">Ask a BridgeWay business administrator to invite the email address you use for staff sign in.</p><a className="session-sign-in" href="/staff/login">Try another sign-in</a>{platformAdmin && <p><a href="/admin">Open the platform admin console →</a></p>}</section></main>;

  return <><main className="dashboard dashboard-wide" id="main-content" aria-busy={session === "loading" || refreshing}>
    <div className="dashboard-heading"><div><p className="eyebrow">BRIDGEWAY STAFF WORKSPACE</p><h1>{selectedBusiness?.name || "Referral follow-up"}</h1><p className="muted">{selectedBusiness?.preset === "trades" ? "Trade requests and partner outcomes." : "Referral requests and partner outcomes."}</p></div>
      <div className="workspace-actions"><label className="business-switcher-light" htmlFor="workspace-select">Workspace<select id="workspace-select" value={workspace} onChange={e => selectWorkspace(e.target.value)}><option value="">Choose a workspace…</option>{businesses.map(b => <option value={b.businessId} key={b.businessId}>{b.name} · {b.role}</option>)}</select></label><nav className="section-nav" aria-label="Dashboard sections"><a href="#inbox">Follow-up</a><a href="#office-report">Analytics</a><a href="#management">Setup</a>{platformAdmin && <a href="/admin">Platform admin</a>}</nav></div>
    </div>
    <p className="error-message" role="alert">{error}</p><p className="hint" role="status">{notice}</p>
    {!workspace ? <section className="workspace-empty">Choose a workspace to view its private referrals.</section> : selectedBusiness?.signupPending ?
      <section className="card access-form">
        <h2>Finish setting up your subscription</h2>
        <p>Once Stripe confirms your payment, your referral dashboard will open here.</p>
        <div className="billing-actions">
          {isAdmin && <button className="primary" disabled={!billing?.configured || busy === "billing"} onClick={() => void subscribe()}>Continue to Stripe</button>}
          <button className="secondary" disabled={refreshing} onClick={() => void refresh()}>Check payment status</button>
        </div>
      </section> : <>
      {profile && !profile.accepting && <p className="notice">{profile.suspended ? "This workspace is paused by BridgeWay. Card taps show a closed form until it is reactivated." : !profile.acceptReferrals ? "Referral intake is turned off in the business profile below." : "Referral intake opens once the subscription is active. Use Subscribe in the Billing section."}</p>}
      {adminMode && <OfficeReport report={selectedReport} availableMonths={report?.availableMonths} month={month} onMonth={selectMonth}/>}
      <section className="inbox-section" id="inbox" aria-labelledby="inbox-title"><div className="section-heading"><div><p className="eyebrow">FOLLOW-UP TODAY</p><h2 id="inbox-title">Referral inbox</h2><p className="muted">New, unassigned, and overdue requests first.</p></div><button className="secondary" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh inbox ↻"}</button></div>
        <div className="metrics" role="group" aria-label="Filter referrals by status">{["", ...allowedStatuses].map(status => <button key={status} className="metric" aria-pressed={filter === status} aria-controls="referrals" onClick={() => setFilter(status)}>{status || "All requests"}<b>{status ? referrals.filter(r => r.status === status).length : referrals.length}</b></button>)}</div>
        <div className="followup-toolbar"><label htmlFor="inbox-search">Search<input id="inbox-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, email, partner"/></label><label htmlFor="partner-filter">Partner<select id="partner-filter" value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}><option value="">All partners</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label htmlFor="received-from">Received from<input id="received-from" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}/></label><label htmlFor="received-to">Received to<input id="received-to" type="date" value={toDate} onChange={e => setToDate(e.target.value)}/></label><label htmlFor="status-filter">Status<select id="status-filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="">All statuses</option>{allowedStatuses.map(s => <option key={s}>{s}</option>)}</select></label><span id="inbox-view" role="status">{filtered.length} shown{updated ? ` · Updated ${updated}` : ""}</span></div>
        {limited && <p className="notice">Showing the newest 500 requests. Analytics includes all retained records.</p>}
        <div className="referrals" id="referrals">{!filtered.length && <p className="empty">{session === "loading" ? "Loading requests…" : "No requests match these filters."}</p>}{filtered.map(r => {
          const isOverdue = !["Completed", "Won", "Closed"].includes(r.status) && Date.now() - Date.parse(r.createdAt) > 48 * 60 * 60 * 1000;
          const needsFollowup = r.status === "New" || !r.ownerId || isOverdue;
          const nextAction = r.status === "New" ? "Contact within one business day" : selectedBusiness?.preset === "trades" && r.status === "Quoted" ? "Follow up on the quote" : r.status === "Contacted" ? selectedBusiness?.preset === "trades" ? "Confirm quote or visit" : "Confirm consultation" : selectedBusiness?.preset === "trades" && r.status === "Won" ? "Job won" : r.status === "Scheduled" ? "Confirm appointment" : r.status;
          const displayName = r.firstName || r.lastName ? [r.firstName, r.lastName].filter(Boolean).join(" ") : r.name;
          return <article className="referral" key={r.id}><div className="title-row"><h2>{displayName}</h2><label>Status<select className="status" aria-label={`Status for ${displayName}`} value={r.status} disabled={busy === r.id} onChange={e => void changeStatus(r, e.target.value)}>{allowedStatuses.map(s => <option key={s}>{s}</option>)}</select></label></div>
            <p className="muted">Receiving site: {r.doctorName || "Direct request"} · Referring partner: {r.partnerName || "Direct request"} · Card: {r.cardId || r.doctorCode || "Direct request"} · Received {new Date(r.createdAt).toLocaleString("en-US", { timeZone: "America/Denver" })} MT{r.updatedAt ? ` · Updated ${new Date(r.updatedAt).toLocaleString("en-US", { timeZone: "America/Denver" })} MT` : ""}{r.serviceType ? ` · ${r.serviceType}` : ""}{r.postalCode ? ` · ${r.postalCode}` : ""}</p>
            <div className="details"><a href={"mailto:" + encodeURIComponent(r.email)}>{r.email}</a><a href={"tel:" + r.phone.replace(/[^+\d]/g, "")}>{r.phone}</a></div>{r.notes && <p className="notes">{r.notes}</p>}
            <div className="referral-action">{needsFollowup && <span className="referral-priority">{isOverdue ? "Overdue" : r.status === "New" ? "New request" : "Unassigned"}</span>}<span className="next-action">Next: {nextAction}</span><label htmlFor={`owner-${r.id}`}>Owner<select id={`owner-${r.id}`} value={r.ownerId || ""} disabled={busy === "owner-" + r.id} onChange={e => void assign(r, members.find(m => m.id === e.target.value))}><option value="">Unassigned</option>{members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label><button className="secondary detail-toggle" aria-expanded={detailId === r.id} onClick={() => void showHistory(r.id)}>Contact &amp; history</button></div>
            {detailId === r.id && <div className="referral-history"><strong>Status history</strong>{!history[r.id] ? <p role="status">Loading history…</p> : history[r.id].length ? <ol>{history[r.id].map((item, index) => <li key={index}>{item.status} · {new Date(item.changedAt).toLocaleString("en-US", { timeZone: "America/Denver" })} MT · {item.actor}</li>)}</ol> : <p>No status changes yet.</p>}</div>}
          </article>;
        })}</div>
      </section>
      <div className="management-grid" id="management"><section className="card doctors"><p className="eyebrow">REFERRAL NETWORK</p><h2>Partners, offices &amp; cards</h2><p className="muted">Each NFC card links to one referring partner. BridgeWay issues and activates the physical cards; copy a link or QR code below.</p>
        {isAdmin && <><form className="inline" onSubmit={createPartner}><label htmlFor="partner-name">Add partner<input id="partner-name" name="name" maxLength={120} required placeholder="Builder or referring office"/></label><button className="secondary" disabled={busy === "partner"}>Add partner</button></form><div className="form-grid"><form className="inline" onSubmit={createOffice}><label htmlFor="office-name">Add receiving office<input id="office-name" name="name" maxLength={120} required placeholder="Office name"/></label><button className="secondary" disabled={busy === "office"}>Add office</button></form></div></>}
        <div className="partner-card-list">{cards.map(card => <article className="card-row" key={card.id}><div><strong>{card.partnerName} · {card.officeName}</strong><small>{card.active ? "Active" : "Inactive"} · {card.url}</small></div><div className="card-row-actions"><button className="secondary" onClick={() => void navigator.clipboard.writeText(card.url).then(() => setNotice("Referral link copied.")).catch(() => setError("Copy unavailable. Select the link to copy it manually."))}>Copy link</button><button className="secondary" onClick={() => void makeQr(card)}>QR code</button></div>{qrCard?.id === card.id && <div className="qr-download"><img src={qrCard.data} alt={`QR code for ${card.partnerName}`}/><a href={qrCard.data} download={`bridgeway-${card.id}.png`}>Download QR PNG</a></div>}</article>)}</div>
        <div className="partner-card-list"><p className="eyebrow">PARTNERS</p>{partners.map(p => <div className="card-row" key={p.id}><strong>{p.name}</strong><small>{p.active ? "Active" : "Inactive"}</small></div>)}</div>
        <div className="partner-card-list"><p className="eyebrow">RECEIVING OFFICES</p>{offices.map(o => <div className="card-row" key={o.id}><strong>{o.name}</strong><small>{o.active ? "Active" : "Inactive"}</small></div>)}</div>
      </section>
      <div className="management-stack">
        {isAdmin && profile && <section className="card"><p className="eyebrow">PUBLIC INTAKE</p><h2>Business profile</h2><form className="form-grid" onSubmit={saveProfile}><label htmlFor="profile-name">Business name<input id="profile-name" name="name" maxLength={120} defaultValue={profile.name} required/></label><label htmlFor="profile-preset">Preset<select id="profile-preset" name="preset" defaultValue={profile.preset}><option value="dental">Dental &amp; orthodontic</option><option value="trades">Home services</option></select></label><label className="span-two" htmlFor="profile-welcome">Form welcome<input id="profile-welcome" name="welcomeText" maxLength={500} defaultValue={profile.welcomeText}/></label><label htmlFor="profile-phone">Office phone<input id="profile-phone" name="phone" maxLength={40} defaultValue={profile.phone}/></label><label htmlFor="profile-logo">Logo URL<input id="profile-logo" name="logoUrl" maxLength={500} defaultValue={profile.logoUrl} placeholder="https://…"/></label><label className="span-two" htmlFor="profile-alert">New-referral alert email<input id="profile-alert" name="alertEmail" type="email" maxLength={254} defaultValue={profile.alertEmail} placeholder="frontdesk@yourbusiness.com"/></label><label className="check span-two"><input type="checkbox" name="acceptReferrals" defaultChecked={profile.acceptReferrals}/><span>Accept referral requests from our cards.</span></label><button className="primary span-two" disabled={busy === "profile"}>Save business profile</button></form></section>}
        {isAdmin && <section className="card"><p className="eyebrow">INVITE-ONLY ACCESS</p><h2>Staff access</h2><form className="inline" onSubmit={inviteMember}><label htmlFor="invite-email">Invite email<input id="invite-email" name="email" type="email" maxLength={254} required placeholder="teammate@business.com"/></label><label htmlFor="invite-role">Role<select id="invite-role" name="role"><option>Staff</option><option>Admin</option></select></label><button className="secondary" disabled={busy === "invite"}>Create invite</button></form>{inviteLink && <p className="invite-link">Invite URL <a href={inviteLink}>{inviteLink}</a><button className="secondary" onClick={() => void navigator.clipboard.writeText(inviteLink)}>Copy</button></p>}<div className="partner-card-list">{members.map(m => <div className="card-row" key={m.id}><div><strong>{m.name}</strong><small>{m.email} · {m.role}</small></div><button className="secondary" disabled={busy === "member-" + m.id} onClick={() => void revokeMember(m)}>Revoke access</button></div>)}{invitations.filter(i => i.state === "Pending").map(i => <div className="card-row" key={i.id}><div><strong>{i.email}</strong><small>Invite pending · {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}</small></div><button className="secondary" disabled={busy === "invite-" + i.id} onClick={() => void cancelInvitation(i)}>Cancel invite</button></div>)}</div></section>}
        {isAdmin && <section className="card" id="billing"><p className="eyebrow">BUSINESS SUBSCRIPTION</p><h2>Billing</h2><div className="billing-price"><strong>${billing?.amountUsd ?? 50}</strong><span>USD / business / month</span></div><p className="muted">Status: <b>{billing?.status || "Loading"}</b>{billing?.renewalAt ? ` · Renews ${new Date(billing.renewalAt).toLocaleDateString()}` : ""}{billing?.cancelAtPeriodEnd ? " · Cancels at period end" : ""}</p><div className="billing-actions"><button className="primary" disabled={!billing?.configured || billing?.billingExempt || busy === "billing" || ["active", "trialing", "past_due"].includes(billing?.status || "")} onClick={() => void subscribe()}>Subscribe</button><button className="secondary" disabled={!billing?.customerLinked || busy === "billing"} onClick={() => void manageBilling()}>Manage Billing</button></div>{billing?.billingExempt && <p className="hint">Billing is covered by BridgeWay for this workspace.</p>}{billing && !billing.configured && <p className="hint">Online billing is not available yet. Contact BridgeWay.</p>}{billing?.testMode && <p className="hint">Stripe test mode: no real charges.</p>}{billing?.status === "past_due" && <p className="notice">Your last payment failed. Update your card in Manage Billing to keep referrals flowing.</p>}</section>}
        <section className="card email-settings"><p className="eyebrow">STAY INFORMED</p><h2>Email alerts</h2><p role="status">{alerts ? alerts.enabled ? `Sending to ${alerts.recipient}. ${alerts.waiting} waiting, ${alerts.retrying} retrying.` : "Add an alert email in the business profile to get notified of new referrals." : "Checking email settings…"}</p>{isAdmin && <button className="secondary" disabled={!alerts?.enabled || busy === "alert"} onClick={() => void testAlert()}>Send test alert ↗</button>}<p className="hint">Alerts contain a dashboard link. Referral details stay in the dashboard.</p></section>
      </div></div>
    </>}
  </main></>;
}


"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import GoogleSignIn from "./GoogleSignIn";
import AdminStripeSubscription from "./AdminStripeSubscription";
import PatientForm from "./PatientForm";
import "./admin-console.css";
import AccountMenu from "./AccountMenu";
import { signOut, type Account } from "../lib/account";
import { api, ApiError, type PublicConfig } from "../lib/api";

type AdminSession = { email: string; account?: Account; acceptingGlobally: boolean; smtpConfigured: boolean; stripeConfigured: boolean; monthlyPriceUsd: number; publicOrigin?: string; canonicalOriginReady?: boolean };
type BusinessSummary = { businessId: string; name: string; createdAt: string; suspended: boolean; archived?: boolean; logoUrl?: string; patientCardCode?: string; welcomeText?: string; phone?: string; acceptReferrals: boolean; billingExempt: boolean; billingStatus: string; hasStripeSubscription?: boolean; intakeOpen?: boolean; checkoutExpiresAt?: string; alertEmail: string; cards: number; taps: number; referrals: number; etag: string };
type Totals = { businesses: number; cards: number; taps: number; referrals: number };
type AdminCard = { id: string; label: string; partnerId: string; partnerName: string; officeId?: string; officeName: string; active: boolean; createdAt: string; etag: string; url: string; taps: number; referrals: number };
type Detail = { business: BusinessSummary; cards: AdminCard[]; partners: { id: string; name: string; active: boolean }[]; offices: { id: string; name: string; logoUrl?: string; active: boolean }[]; members: { id: string; etag: string; email: string; role: string }[]; invitations: { id: string; etag: string; email: string; role: string; expiresAt: string }[] };

const paid = ["active", "trialing", "past_due"];
function liveState(b: BusinessSummary, session: AdminSession | null) {
  if (b.archived) return "Archived";
  if (b.suspended) return "Suspended";
  if (!session?.acceptingGlobally) return "Intake closed globally";
  if (!b.acceptReferrals) return "Intake off";
  if (!b.billingExempt && !paid.includes(b.billingStatus)) return "Awaiting payment";
  return "Live";
}

export default function AdminConsole() {
  const [tab, setTab] = useState<"businesses" | "cards" | "create" | "website">("businesses");
  const [workspaceView, setWorkspaceView] = useState<"cards" | "settings" | "people" | "activity">("cards");
  const [state, setState] = useState<"loading" | "ready" | "signin" | "denied">("loading");
  const [session, setSession] = useState<AdminSession | null>(null), [businesses, setBusinesses] = useState<BusinessSummary[]>([]), [totals, setTotals] = useState<Totals | null>(null);
  const [selected, setSelected] = useState(""), [detail, setDetail] = useState<Detail | null>(null);
  const [search, setSearch] = useState(""), [liveFilter, setLiveFilter] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(""), [issued, setIssued] = useState<{ label: string; url: string }[]>([]), [qr, setQr] = useState<{ id: string; data: string } | null>(null);

  const [activity, setActivity] = useState<{ id: string; createdAt: string; actor: string; action: string }[]>([]);
  const [activityBusiness, setActivityBusiness] = useState("");
  const [logoCheck, setLogoCheck] = useState<{ url: string; loaded: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<PublicConfig | null>(null);
  const detailRequest = useRef(0);
  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) setState("signin");
    else if (e instanceof ApiError && e.status === 403) setState("denied");
    else setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
  }, []);

  const loadList = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([api<AdminSession>("/api/admin/session"), api<{ businesses: BusinessSummary[]; totals: Totals }>("/api/admin/businesses")]);
      setSession(s); setBusinesses(list.businesses.sort((a, b) => a.name.localeCompare(b.name))); setTotals(list.totals); setState("ready");
    } catch (e) { fail(e); }
  }, [fail]);
  const loadDetail = useCallback(async (businessId: string) => {
    const request = ++detailRequest.current;
    if (!businessId) { setDetail(null); return; }
    try {
      const result = await api<Detail>("/api/admin/businesses/" + encodeURIComponent(businessId));
      if (request === detailRequest.current) setDetail(result);
    } catch (e) {
      if (request === detailRequest.current) fail(e);
    }
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
      form.reset(); setNotice(`${created.name} created. Send the business admin this sign-in link: ${created.inviteUrl}`); await loadList(); setSelected(created.businessId); setWorkspaceView("cards"); setTab("cards");
    });
  }
  function updateBusiness(changes: { suspended?: boolean; billingExempt?: boolean; alertEmail?: string; logoUrl?: string; archived?: boolean; acceptReferrals?: boolean; welcomeText?: string; phone?: string; patientCardCode?: string }) {
    if (!detail) return;
    void run("update", async () => { await api("/api/admin/businesses/" + detail.business.businessId, { method: "PATCH", body: JSON.stringify({ ...changes, etag: detail.business.etag }) }); if (changes.archived !== undefined) {
        setNotice(changes.archived ? "Business archived. Use the Archived filter to restore or delete it." : "Business restored.");
        setSelected("");
        setLiveFilter("");
        setTab("businesses");
        await loadList();
      } else {
        setNotice(changes.logoUrl !== undefined ? "Business logo saved." : "Business updated.");
        await refreshAll();
      } });
  }
  function uploadLogo(business: BusinessSummary, file?: File) {
    if (!file || busy) return;
    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      setError("Choose a logo up to 2 MB.");
      return;
    }

    void run("logo", async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await api("/api/admin/businesses/" + business.businessId + "/logo", {
        method: "POST", body: JSON.stringify({ image: btoa(binary), etag: business.etag }),
      });
      await refreshAll();
      setNotice("Business logo uploaded.");
    });
  }

  function savePatientForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    updateBusiness({ welcomeText: String(form.get("welcomeText") ?? ""), phone: String(form.get("phone") ?? ""), patientCardCode: form.get("patientCardCode")?.toString() });
  }

  function deleteBusiness(business: BusinessSummary) {
    const name = window.prompt(`Delete ${business.name} from admin? Existing records are retained. Enter the business name to confirm.`);
    if (name === null) return;
    if (name !== business.name) { setError("The business name did not match."); return; }
    void run("delete", async () => {
      await api("/api/admin/businesses/" + business.businessId, { method: "DELETE", body: JSON.stringify({ etag: business.etag, name }) });
      setSelected("");
      setTab("businesses");
      await loadList();
      setNotice("Business deleted from admin.");
    });
  }

  function previewCard(business: BusinessSummary, card: AdminCard) {
    void run("preview", async () => {
      setPreview(await api<PublicConfig>(`/api/admin/businesses/${business.businessId}/cards/${card.id}/preview`));
    });
  }

  function saveLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateBusiness({ logoUrl: String(new FormData(event.currentTarget).get("logoUrl") ?? "").trim() });
  }
  function saveAlert(event: FormEvent<HTMLFormElement>) { event.preventDefault(); updateBusiness({ alertEmail: String(new FormData(event.currentTarget).get("alertEmail") || "") }); }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return; const form = event.currentTarget; const data = new FormData(form);
    void run("invite", async () => { const result = await api<{ inviteUrl: string; email: string }>("/api/admin/businesses/" + detail.business.businessId + "/invitations", { method: "POST", body: JSON.stringify({ email: data.get("email"), role: data.get("role") }) }); form.reset(); setNotice(`Invite ready for ${result.email}. They sign in at ${result.inviteUrl}`); await loadDetail(selected); });
  }
  function updateMember(business: BusinessSummary, member: Detail["members"][number], action: { role?: string; revoke?: boolean }) {
    if (action.revoke && !window.confirm("Remove access for " + member.email + "?")) return;
    void run("team", async () => {
      await api(`/api/admin/businesses/${business.businessId}/members/${member.id}`, {
        method: "PATCH", body: JSON.stringify({ etag: member.etag, ...action }),
      });
      await loadDetail(business.businessId);
      setNotice(action.revoke ? "Access removed." : "Role updated.");
    });
  }

  function updateInvitation(business: BusinessSummary, invite: Detail["invitations"][number], replace: boolean) {
    if (!window.confirm(replace ? "Replace this invitation and invalidate its previous link?" : "Revoke this invitation?")) return;
    void run("team", async () => {
      const result = await api<{ inviteUrl?: string; sent?: boolean }>(`/api/admin/businesses/${business.businessId}/invitations/${invite.id}`, {
        method: "PATCH", body: JSON.stringify({ etag: invite.etag, replace }),
      });
      await loadDetail(business.businessId);
      setNotice(result.sent ? "Invitation resent." : result.inviteUrl ? "Email unavailable. Send the replacement invitation link: " + result.inviteUrl : "Invitation revoked.");
    });
  }

  function showActivity(businessId: string) {
    setWorkspaceView("activity");
    setActivityBusiness("");
    void run("activity", async () => {
      const result = await api<{ activity: typeof activity }>(`/api/admin/businesses/${businessId}/activity`);
      setActivity(result.activity);
      setActivityBusiness(businessId);
    });
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

  if (state === "signin") return <main className="dashboard" id="main-content"><section className="card session-expired"><img className="session-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={100} height={34} /><h1>Platform admin sign-in</h1><p>Sign in with your BridgeWay owner account.</p><a className="session-sign-in" href="/admin/login">Continue with Microsoft</a><GoogleSignIn admin /></section></main>;
  if (state === "denied") return <main className="dashboard" id="main-content"><section className="card session-expired" role="alert"><img className="session-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={100} height={34} /><h1>Access denied</h1><p>This account is not a platform administrator.</p><a className="session-sign-in" href="/staff">Go to the staff dashboard</a><button type="button" className="secondary" onClick={() => void signOut()}>Sign out and use another account</button></section></main>;

  const b = detail?.business.businessId === selected ? detail.business : undefined;
  const routingCard = detail?.cards.find(card => card.id === b?.patientCardCode && card.active);
  const routingOffice = detail?.offices.find(office => office.id === routingCard?.officeId);
  const effectiveLogo = routingOffice?.logoUrl || b?.logoUrl;
  const patientLink = b ? (session?.publicOrigin ?? "") + "/p/" + b.businessId : "";
  const checkoutOpen = Boolean(b?.checkoutExpiresAt && Date.parse(b.checkoutExpiresAt) > Date.now());
  const sectionTitle = { businesses: "Businesses", cards: b?.name ?? "NFC cards", create: "Create business", website: "Website status" }[tab];
  const shownBusinesses = businesses.filter(x => (!search || x.name.toLowerCase().includes(search.toLowerCase())) && (liveFilter ? liveState(x, session) === liveFilter : !x.archived));
  return <main className="dashboard dashboard-wide admin-workspace admin-console" id="main-content" aria-busy={state === "loading" && !error}>
    <nav className="section-nav admin-tabs" aria-label="Admin sections">
      <a className="admin-rail-brand" href="/" aria-label="BridgeWayRefer home"><img src="/brand-logo.png" alt="" /></a>
      {([
        { label: "Workspaces", items: [["businesses", "Businesses"], ["cards", "NFC cards"], ["create", "Create business"]] },
        { label: "Platform", items: [["website", "Website status"]] },
      ] as const).map(group => <div className="admin-nav-group" key={group.label}>
        <p>{group.label}</p>
        {group.items.map(([key, label]) => <button type="button" key={key} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>)}
      </div>)}
    </nav>
    <div className="admin-workspace-content">
    {preview && <dialog className="admin-patient-preview" aria-label="Patient form preview"
      ref={node => { if (node && !node.open) node.showModal(); }} onClose={() => setPreview(null)}>
      <form method="dialog"><button className="secondary">Close preview</button></form>
      <PatientForm config={preview} preview />
    </dialog>}
    <header className="admin-page-heading">
      <div>
        {b && tab === "cards"
          ? <button type="button" className="admin-back-link" onClick={() => setTab("businesses")}>Back to businesses</button>
          : <p className="eyebrow">Platform admin</p>}
        <h1>{sectionTitle}</h1>
      </div>
      {tab === "cards" && <label className="business-switcher-light" htmlFor="admin-workspace">Workspace
        <select id="admin-workspace" value={selected} disabled={Boolean(busy)} onChange={event => setSelected(event.target.value)}>
          <option value="">Choose a workspace</option>
          {businesses.map(business => <option key={business.businessId} value={business.businessId}>{business.name}{business.archived ? " (archived)" : ""}</option>)}
        </select>
      </label>}
      <AccountMenu account={session?.account ?? null} area="admin" platformAdmin actions={b && !b.archived ? [
        { label: "NFC cards", onSelect: () => { setTab("cards"); setWorkspaceView("cards"); } },
        { label: "Workspace settings", onSelect: () => { setTab("cards"); setWorkspaceView("settings"); } },
        { label: "People and invitations", onSelect: () => { setTab("cards"); setWorkspaceView("people"); } },
      ] : []} />
    </header>
    {error && <div className="admin-error">
      <p className="error-message" role="alert">{error}</p>
      {state === "loading" && <button className="secondary" onClick={() => { setError(""); void loadList(); }}>Retry</button>}
    </div>}
    <p className="hint" role="status" hidden={!notice}>{notice}</p>
    {session?.canonicalOriginReady === false && <p className="notice">Public URLs currently use {session.publicOrigin}. Coordinate the API PublicOrigin and Microsoft callback registration for https://bridgewayrefer.com before customer onboarding.</p>}
    {session && (!session.acceptingGlobally || !session.smtpConfigured || !session.stripeConfigured) && <p className="notice">{!session.acceptingGlobally && "Global intake is off (AcceptReferrals). "}{!session.smtpConfigured && "Email alerts are not configured (SMTP). "}{!session.stripeConfigured && "Stripe billing is not configured."}</p>}

    {tab === "businesses" && totals && <dl className="admin-metrics">
      <div><dt>Businesses</dt><dd>{totals.businesses} <small>{businesses.filter(x => liveState(x, session) === "Live").length} live</small></dd></div>
      <div><dt>Card taps</dt><dd>{totals.taps} <small>{totals.cards} cards issued</small></dd></div>
      <div><dt>Referrals submitted</dt><dd>{totals.referrals}</dd></div>
    </dl>}

    <section className="card" id="admin-businesses" hidden={tab !== "businesses"}>
      <div className="admin-directory-heading"><h2>Workspace directory</h2>
        <button className="primary" onClick={() => setTab("create")}>Add business</button>
      </div>
      <div className="admin-filters"><label className="sr-only" htmlFor="admin-search">Search businesses</label><input id="admin-search" type="search" placeholder="Search businesses" value={search} onChange={e => setSearch(e.target.value)} /><label className="sr-only" htmlFor="admin-state">Filter by status</label><select id="admin-state" value={liveFilter} onChange={e => setLiveFilter(e.target.value)}><option value="">Current businesses</option>{["Live", "Awaiting payment", "Intake off", "Intake closed globally", "Suspended", "Archived"].map(v => <option key={v}>{v}</option>)}</select></div>
      <div className="table-scroll admin-table"><table className="office-table"><thead><tr><th>Business</th><th>Status</th><th>Billing</th><th>Cards</th><th>Card taps</th><th>Referrals</th></tr></thead><tbody>
        {shownBusinesses.map(x => <tr key={x.businessId} className={x.businessId === selected ? "is-selected" : undefined}><td><button className="secondary admin-business-button" onClick={() => { setSelected(x.businessId); setWorkspaceView("cards"); setTab("cards"); }}>{x.name}</button><small className="admin-business-id">{x.businessId}</small></td><td data-label="Status">{liveState(x, session)}</td><td data-label="Billing">{x.billingExempt ? "Exempt" : x.billingStatus}</td><td data-label="Cards">{x.cards}</td><td data-label="Card taps">{x.taps}</td><td data-label="Referrals">{x.referrals}</td></tr>)}
        {!shownBusinesses.length && <tr><td colSpan={6}>{error && state === "loading" ? "Directory unavailable." : state === "loading" ? "Loading…" : businesses.length ? "No businesses match." : "No businesses yet. Create the first one."}</td></tr>}
      </tbody></table></div>
    </section>

    {tab === "cards" && !b && <section className="card workspace-empty" id="admin-cards"><h2>Connect NFC cards</h2><p>{selected ? "Loading workspace..." : "Choose a workspace to issue cards, edit settings, or manage invitations."}</p></section>}
    {b?.archived && tab === "cards" && <section className="card" id="admin-cards">
      <h2>{b.name}</h2>
      <p>This business is archived. Restore it to reopen the workspace and resume its previous intake settings.</p>
      <button className="secondary" disabled={Boolean(busy)} onClick={() => updateBusiness({ archived: false })}>Restore business</button>
      <p>{checkoutOpen && b.checkoutExpiresAt
        ? "Deletion is blocked until the open checkout expires on " + new Date(b.checkoutExpiresAt).toLocaleString() + "."
        : b.hasStripeSubscription
          ? "Deletion checks Stripe for an ended subscription. Existing records are retained."
          : "Deletion disables patient links and retains existing records."}</p>
      <button className="secondary admin-destructive" disabled={Boolean(busy) || checkoutOpen} onClick={() => deleteBusiness(b)}>Delete business</button>
      {b.hasStripeSubscription && <AdminStripeSubscription key={b.businessId} businessId={b.businessId} />}
    </section>}
    {b && !b.archived && detail && tab === "cards" && <div id="admin-cards" className="admin-workspace-detail">
      <div className="admin-workspace-bar">
        <nav aria-label="Workspace sections" className="admin-workspace-tabs">
          {([["cards", "Cards"], ["settings", "Business settings"], ["people", "People"], ["activity", "Activity"]] as const).map(([key, label]) =>
            <button type="button" key={key} aria-current={workspaceView === key ? "page" : undefined} onClick={() => key === "activity" ? showActivity(b.businessId) : setWorkspaceView(key)}>{label}</button>)}
        </nav>
        <span className="admin-status">{liveState(b, session)}</span>
      </div>
      {workspaceView === "cards" && <section className="card" key={b.businessId}><h2>Issue NFC cards</h2>
        <p className="muted">Copy the patient form link to NFC Tools. Choose Write, add a URL record, then tap the card against your phone. Use the same link for the QR code.</p>
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
        <div className="partner-card-list">{detail.cards.map(card => <article className="card-row" key={card.id}><div><strong>{card.label ? card.label + " · " : ""}{card.partnerName} → {card.officeName}</strong><dl className="facts">{[["Status", card.active ? "Active" : "Inactive"], ["Taps", String(card.taps)], ["Referrals", String(card.referrals)]].map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl><small className="card-url"><a href={card.url} target="_blank" rel="noreferrer">Open patient form</a><br /><span>{card.url}</span></small></div><div className="card-row-actions"><button className="secondary" onClick={() => copy(card.url)}>Copy NFC link</button>{card.active && <button className="secondary" disabled={Boolean(busy)} onClick={() => previewCard(b, card)}>Preview patient form</button>}<button className="secondary" onClick={() => void makeQr(card)}>Show QR code</button><button className="secondary" disabled={busy === card.id} onClick={() => toggleCard(card)}>{card.active ? "Deactivate" : "Activate"}</button></div>{qr?.id === card.id && <div className="qr-download"><img src={qr.data} alt={`QR code for ${card.partnerName}`}/><a href={qr.data} download={`bridgeway-${card.id}.png`}>Download QR PNG</a></div>}</article>)}{!detail.cards.length && <p className="empty">No cards yet.</p>}</div>
      </section>}
      {workspaceView === "settings" && <div className="admin-settings-grid">
        <section className="card">
          <h2>Business branding</h2>
          {b.logoUrl && <img key={b.logoUrl} src={b.logoUrl} alt={b.name + " logo"} className="admin-business-logo" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
          <div className="admin-logo-drop" data-dragging={dragging} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
            onDrop={event => { event.preventDefault(); setDragging(false); uploadLogo(b, event.dataTransfer.files[0]); }}>
            <label htmlFor="admin-logo-file">{busy === "logo" ? "Uploading logo..." : "Drop a logo here or choose a file"}</label>
            <input id="admin-logo-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(busy)}
              onChange={event => { uploadLogo(b, event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
            <small>PNG, JPEG or WebP, up to 2 MB</small>
          </div>
          <form className="admin-field-stack" onSubmit={saveLogo} key={b.businessId + ":" + (b.logoUrl ?? "")}>
            <label htmlFor="admin-logo-url">Logo URL</label>
            <input id="admin-logo-url" name="logoUrl" defaultValue={b.logoUrl ?? ""} maxLength={2048} aria-describedby="admin-logo-help" />
            <p id="admin-logo-help" className="hint">Use an HTTPS image link. Leave blank to remove the logo.</p>
            <button className="secondary" disabled={Boolean(busy)}>Save logo</button>
          </form>
        </section>
        <section className="card">
          <h2>Patient form</h2>
          <form key={b.businessId + ":" + b.welcomeText + ":" + b.phone + ":" + b.patientCardCode} className="admin-field-stack" onSubmit={savePatientForm}>
            <label htmlFor="admin-welcome">Welcome message</label>
            <textarea id="admin-welcome" name="welcomeText" rows={3} maxLength={500} defaultValue={b.welcomeText ?? ""} />
            <label htmlFor="admin-patient-phone">Business phone</label>
            <input id="admin-patient-phone" name="phone" type="tel" maxLength={40} defaultValue={b.phone ?? ""} />
            <label htmlFor="admin-patient-card">Receiving office and partner</label>
            <select id="admin-patient-card" name="patientCardCode" defaultValue={b.patientCardCode ?? ""}>
              <option value="">Patient link disabled</option>
              {b.patientCardCode && !detail.cards.some(card => card.active && card.id === b.patientCardCode) &&
                <option value={b.patientCardCode} disabled>Previous card unavailable</option>}
              {detail.cards.filter(card => card.active).map(card => <option key={card.id} value={card.id}>
                {card.officeName} / {card.partnerName}{card.label ? " / " + card.label : ""}
              </option>)}
            </select>
            <p className="hint">Select an active card to enable this business's unique patient link.</p>
            <button className="secondary" disabled={Boolean(busy)}>Save patient form</button>
          </form>
          <dl className="admin-service-list">
            <div><dt>Intake</dt><dd>{b.intakeOpen ? "Open" : "Closed"}</dd></div>
            <div><dt>Routing</dt><dd>{routingCard ? routingCard.officeName + " / " + routingCard.partnerName : "Choose an active card"}</dd></div>
            <div><dt>Logo</dt><dd>{effectiveLogo ? logoCheck?.url === effectiveLogo ? (logoCheck.loaded ? "Loads" : "Could not load") : "Checking" : "Office name in text"}</dd></div>
          </dl>
          {effectiveLogo && <img className="admin-business-logo" src={effectiveLogo} alt="Patient form logo"
            referrerPolicy="no-referrer" onLoad={() => setLogoCheck({ url: effectiveLogo, loaded: true })}
            onError={event => { event.currentTarget.hidden = true; setLogoCheck({ url: effectiveLogo, loaded: false }); }} key={effectiveLogo} />}
          {routingCard && <div className="admin-patient-link">
            <a href={patientLink} target="_blank" rel="noreferrer">Open patient link</a>
            <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => previewCard(b, routingCard)}>Preview patient form</button>
            <button type="button" className="secondary" onClick={() => copy(new URL(patientLink, window.location.origin).href)}>Copy patient link</button>
            <button type="button" className="secondary" onClick={() => void makeQr({ ...routingCard, url: new URL(patientLink, window.location.origin).href, id: "patient-link" })}>Show patient QR</button>
            {qr?.id === "patient-link" && <div className="qr-download"><img src={qr.data} alt="Patient link QR code" />
              <a href={qr.data} download={`bridgeway-${b.businessId}-patient.png`}>Download QR PNG</a></div>}
          </div>}
        </section>
        <section className="card"><h2>Intake and billing</h2>
          <p className="muted">Billing mode <b>{b.billingExempt ? "Exempt (comped)" : "Subscription required"}</b></p>
          {b.hasStripeSubscription
            ? <AdminStripeSubscription key={b.businessId} businessId={b.businessId} />
            : <p className="muted">No Stripe subscription linked.</p>}
          <div className="billing-actions"><button className="secondary" disabled={Boolean(busy)} onClick={() => updateBusiness({ acceptReferrals: !b.acceptReferrals })}>{b.acceptReferrals ? "Turn intake off" : "Turn intake on"}</button><button className="secondary" disabled={busy === "update"} onClick={() => updateBusiness({ suspended: !b.suspended })}>{b.suspended ? "Reactivate business" : "Suspend business"}</button><button className="secondary" disabled={busy === "update"} onClick={() => updateBusiness({ billingExempt: !b.billingExempt })}>{b.billingExempt ? "Require payment" : "Mark billing exempt"}</button></div>
          <form className="inline" onSubmit={saveAlert}><label htmlFor="admin-alert">Alert email<input id="admin-alert" name="alertEmail" type="email" maxLength={254} defaultValue={b.alertEmail} key={b.etag}/></label><button className="secondary" disabled={busy === "update"}>Save</button></form>
        </section>
        <section className="card">
          <h2>Archive business</h2>
          <p className="muted">Archiving hides the business from the default list, blocks staff access and stops new referrals. Records and billing are preserved.</p>
          <button className="secondary" disabled={Boolean(busy)} onClick={() => {
            if (window.confirm(`Archive ${b.name} and pause staff access and intake?`)) updateBusiness({ archived: true });
          }}>Archive business</button>
        </section>
      </div>}
      {workspaceView === "people" && (
        <section className="card"><h2>People and invitations</h2>
          <form className="admin-invite-form" onSubmit={invite}><label htmlFor="admin-invite">Invite email<input id="admin-invite" name="email" type="email" required maxLength={254}/></label><label htmlFor="admin-invite-role">Role<select id="admin-invite-role" name="role"><option>Admin</option><option>Staff</option></select></label><button className="secondary" disabled={busy === "invite"}>Invite</button></form>
          <div className="partner-card-list">
            {detail.members.map(member => {
              const lastAdmin = member.role === "Admin" && detail.members.filter(person => person.role === "Admin").length < 2;
              return <div className="card-row" key={member.id}>
                <div><strong>{member.email}</strong><small>{member.role}{lastAdmin ? " ? Last admin" : ""}</small></div>
                <div className="card-row-actions">
                  <button className="secondary" disabled={!member.id || lastAdmin || Boolean(busy)}
                    onClick={() => updateMember(b, member, { role: member.role === "Admin" ? "Staff" : "Admin" })}>
                    {member.role === "Admin" ? "Make staff" : "Make admin"}
                  </button>
                  <button className="secondary" disabled={!member.id || lastAdmin || Boolean(busy)}
                    onClick={() => updateMember(b, member, { revoke: true })}>Remove access</button>
                </div>
              </div>;
            })}
            {detail.invitations.map(invite => <div className="card-row" key={invite.id}>
              <div><strong>{invite.email}</strong><small>{invite.role} ? Expires {new Date(invite.expiresAt).toLocaleDateString()}</small></div>
              <div className="card-row-actions">
                <button className="secondary" disabled={!invite.id || Boolean(busy)} onClick={() => updateInvitation(b, invite, true)}>Resend invite</button>
                <button className="secondary" disabled={!invite.id || Boolean(busy)} onClick={() => updateInvitation(b, invite, false)}>Revoke invite</button>
              </div>
            </div>)}
          </div>
        </section>
      )}
      {workspaceView === "activity" && <section className="card">
        <div className="admin-directory-heading"><h2>Recent activity</h2><button className="secondary" disabled={busy === "activity"} onClick={() => showActivity(b.businessId)}>Refresh</button></div>
        {activityBusiness === b.businessId && (activity.length ? <ol className="admin-service-list">
          {activity.map(event => <li key={event.id}>
            <strong>{event.action.replace(/^platform-/, "").replaceAll("-", " ")}</strong>
            <div>{event.actor} ? <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>
          </li>)}
        </ol> : <p>No recent activity.</p>)}
      </section>}
    </div>}

    {tab === "website" && <section className="card" id="admin-website">
      <h2>Platform services</h2>
      {session && <dl className="admin-service-list">
        <div><dt>Public referral origin</dt><dd>{session.publicOrigin || "Unavailable"}</dd></div>
        <div><dt>Global referral intake</dt><dd>{session.acceptingGlobally ? "On" : "Off"}</dd></div>
        <div><dt>Referral email alerts</dt><dd>{session.smtpConfigured ? "Configured" : "Not configured"}</dd></div>
        <div><dt>Stripe billing</dt><dd>{session.stripeConfigured ? "Configured" : "Not configured"}</dd></div>
      </dl>}
      <div className="admin-site-links"><a className="text-link" href="/">Public website</a><a className="text-link" href="/staff">Staff dashboard</a></div>
    </section>}
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
    </div>
    </div>
  </main>;
}



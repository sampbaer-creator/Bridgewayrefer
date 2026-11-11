"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api, ApiError, statuses, WORKSPACE_KEY, type Alerts, type Business, type Partner, type Referral, type ReferralHistory, type Report } from "../lib/api";
import FollowUpEditor from "./FollowUpEditor";
import { isOverdue as overdueReferral } from "../lib/follow-up";
import OfficeReport from "./OfficeReport";

type Office = { id: string; name: string; active: boolean; etag: string };
type CardLink = { id: string; partnerId: string; partnerName: string; officeId?: string; officeName: string; active: boolean; etag: string; url: string };
type Member = { id: string; name: string; email: string; role: string; etag: string };
type BusinessProfile = { name: string; officeName: string; welcomeText: string; phone: string; logoUrl: string; acceptReferrals: boolean; accepting: boolean; suspended: boolean; alertEmail: string; billingStatus: string; monthlyPriceUsd: number; etag: string };
type Billing = { plan?: string; amountUsd: number; interval: string; status: string; billingExempt: boolean; renewalAt?: string; cancelAtPeriodEnd: boolean; configured: boolean; managedCallingConfigured?: boolean; testMode: boolean; customerLinked: boolean };
type Invitation = { id: string; email: string; role: string; state: string; expiresAt: string; etag: string };
type Session = { businessId?: string | null; role: string; businesses: Business[] };
type TestReferral = { id: string; name: string; partnerId: string; partnerName: string; officeId: string; cardId: string; status: string; createdAt: string; isTest: true };

export default function StaffDashboard() {
  const [referrals, setReferrals] = useState<Referral[]>([]), [partners, setPartners] = useState<Partner[]>([]), [offices, setOffices] = useState<Office[]>([]), [cards, setCards] = useState<CardLink[]>([]), [members, setMembers] = useState<Member[]>([]);
  const [testReferrals, setTestReferrals] = useState<TestReferral[]>([]), [testReferralsLimited, setTestReferralsLimited] = useState(false), [testCardId, setTestCardId] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>([]), [profile, setProfile] = useState<BusinessProfile | null>(null), [billing, setBilling] = useState<Billing | null>(null), [invitations, setInvitations] = useState<Invitation[]>([]), [alerts, setAlerts] = useState<Alerts | null>(null), [report, setReport] = useState<Report | null>(null);
  const [month, setMonth] = useState(""), [workspace, setWorkspace] = useState(""), [filter, setFilter] = useState(""), [partnerFilter, setPartnerFilter] = useState(""), [query, setQuery] = useState(""), [fromDate, setFromDate] = useState(""), [toDate, setToDate] = useState("");
  const [checkoutPlan, setCheckoutPlan] = useState<"workspace" | "managed-calling">("workspace");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [updated, setUpdated] = useState(""), [limited, setLimited] = useState(false), [session, setSession] = useState<"loading" | "active" | "expired" | "denied">("loading"), [busy, setBusy] = useState(""), [refreshing, setRefreshing] = useState(false);
  const [detailId, setDetailId] = useState(""), [history, setHistory] = useState<Record<string, ReferralHistory[]>>({}), [qrCard, setQrCard] = useState<{ id: string; data: string } | null>(null), [inviteLink, setInviteLink] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null), [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const searchRef = useRef("");
  const setupSteps = useMemo(() => {
    const subscriptionReady = !!billing && (billing.billingExempt || ["active", "trialing", "past_due"].includes(billing.status));
    const locationReady = offices.some(office => office.active);
    const partnerReady = partners.some(partner => partner.active);
    const cardReady = cards.some(card => card.active && !!card.url && partners.some(partner => partner.active && partner.id === card.partnerId) && offices.some(office => office.active && office.id === card.officeId));
    const testReferralReady = cards.some(card => card.active && testReferrals.some(test => test.cardId === card.id));
    const intakeReady = !!profile?.accepting;
    const steps: Array<{ label: string; complete: boolean; detail: string; href: string; action: string; testAction?: boolean }> = [
      { label: "Confirm workspace access", complete: subscriptionReady, detail: subscriptionReady ? billing?.billingExempt ? "Pilot access approved" : `Subscription ${billing?.status}` : "An active subscription or approved pilot is required.", href: "#billing", action: subscriptionReady ? "Review billing" : "Continue to billing" },
      { label: "Set up a receiving location", complete: locationReady, detail: locationReady ? "Active location is ready for referrals." : "Add the branch or practice that will receive referrals.", href: "#management", action: locationReady ? "Review location" : "Add location" },
      { label: "Add a referring partner", complete: partnerReady, detail: partnerReady ? "An active partner can be assigned to a card." : "Add the business or person who will share the card.", href: "#management", action: partnerReady ? "Review partners" : "Add partner" },
      { label: "Issue and check a card link", complete: cardReady, detail: cardReady ? "An active card link is available to preview, copy, or share as QR." : "Create a partner and location card link, then preview its form.", href: "#management", action: cardReady ? "Review cards" : "Set up a card link" },
      { label: "Verify a test referral", complete: testReferralReady, detail: testReferralReady ? "A synthetic referral is visible in the separate test list and excluded from normal reporting." : "Run an admin-only synthetic check. It does not change billing or intake and does not send an alert.", href: "#test-referrals", action: testReferralReady ? "Run another test" : "Run test referral", testAction: true },
      { label: "Enable customer intake", complete: intakeReady, detail: intakeReady ? "Your card links can accept real referrals." : profile?.suspended ? "BridgeWay has paused this workspace. Contact support to reactivate it." : !subscriptionReady ? "Complete billing or confirm an approved pilot first." : !locationReady ? "Add an active receiving location first." : !partnerReady ? "Add an active referring partner first." : !cardReady ? "Issue an active card link first." : !profile?.acceptReferrals ? "Turn on referral requests in Business profile after testing." : "The platform intake switch is off. Contact BridgeWay to enable it.", href: profile?.suspended || !subscriptionReady ? "#billing" : "#management", action: intakeReady ? "Review intake" : "Review prerequisites" },
    ];
    return steps;
  }, [billing, cards, offices, partners, profile, testReferrals]);
  const analyticsLoaded = useRef({ workspace: "", month: "", at: 0 });
  const generation = useRef(0), stopped = useRef(false), selectedMonth = useRef(""), workspaceRef = useRef(""), loading = useRef<{ month: string; workspace: string; controller: AbortController } | null>(null);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      stopped.current = true; generation.current++; loading.current?.controller.abort(); setReferrals([]); setTestReferrals([]); setTestReferralsLimited(false); setPartners([]); setOffices([]); setCards([]); setMembers([]); setReport(null); setAlerts(null); setSession(e.status === 401 ? "expired" : "denied");
    } else setError(e instanceof Error ? e.message : "Service unavailable. Please try again.");
  }, []);

  const refresh = useCallback(async (refreshAnalytics = true) => {
    const requestMonth = selectedMonth.current, requestWorkspace = workspaceRef.current, requestSearch = searchRef.current;
    if (stopped.current || (loading.current?.month === requestMonth && loading.current.workspace === requestWorkspace && !loading.current.controller.signal.aborted)) return;
    loading.current?.controller.abort();
    const controller = new AbortController(), request = ++generation.current;
    loading.current = { month: requestMonth, workspace: requestWorkspace, controller }; setRefreshing(true);
    const current = () => request === generation.current && !stopped.current && !controller.signal.aborted && requestMonth === selectedMonth.current && requestWorkspace === workspaceRef.current && requestSearch === searchRef.current;
    const options = { signal: controller.signal };
    try {
      const auth = await api<Session & { ok: boolean }>("/api/staff/session", options);
      if (!current()) return;
      const available = auth.businesses || []; setBusinesses(available); setSession("active");
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
        if (current()) { setBilling(pendingBilling); setCheckoutPlan(pendingBilling.plan === "managed-calling" ? "managed-calling" : "workspace"); setError(""); }
        return;
      }
      const admin = auth.role === "Admin";
      const inbox = await api<{ referrals: Referral[]; limited: boolean; nextCursor?: string }>("/api/staff/referrals" + (requestSearch ? "?" + requestSearch : ""), options);
      if (!current()) return;
      setReferrals(inbox.referrals); setLimited(inbox.limited); setNextCursor(inbox.nextCursor || null); setUpdated(new Date().toLocaleTimeString()); setError("");

      const panelResults = await Promise.allSettled([
        api<{ partners: Partner[] }>("/api/staff/partners", options), api<{ offices: Office[] }>("/api/staff/offices", options), api<{ cards: CardLink[] }>("/api/staff/cards", options), api<{ members: Member[] }>("/api/staff/members", options), api<BusinessProfile>("/api/staff/business/profile", options), api<Billing>("/api/staff/billing", options), api<Alerts>("/api/staff/alerts", options), admin ? api<{ invitations: Invitation[] }>("/api/staff/invitations", options) : Promise.resolve({ invitations: [] }), admin ? api<{ referrals: TestReferral[]; limited: boolean }>("/api/staff/test-referrals", options) : Promise.resolve({ referrals: [], limited: false }),
      ]);
      if (!current()) return;
      const [partnerData, officeData, cardData, memberData, profileData, billingData, alertData, inviteData, testReferralData] = panelResults;
      if (partnerData.status === "fulfilled") setPartners(partnerData.value.partners);
      if (officeData.status === "fulfilled") setOffices(officeData.value.offices);
      if (cardData.status === "fulfilled") setCards(cardData.value.cards);
      if (memberData.status === "fulfilled") setMembers(memberData.value.members);
      if (profileData.status === "fulfilled") setProfile(profileData.value);
      if (billingData.status === "fulfilled") { setBilling(billingData.value); setCheckoutPlan(billingData.value.plan === "managed-calling" ? "managed-calling" : "workspace"); }
      if (alertData.status === "fulfilled") setAlerts(alertData.value);
      if (inviteData.status === "fulfilled") setInvitations(inviteData.value.invitations);
      if (testReferralData.status === "fulfilled") { setTestReferrals(testReferralData.value.referrals); setTestReferralsLimited(testReferralData.value.limited); }
      const panelError = panelResults.find(result => result.status === "rejected");
      if (panelError?.status === "rejected" && panelError.reason instanceof ApiError && (panelError.reason.status === 401 || panelError.reason.status === 403)) { handleError(panelError.reason); return; }

      if (!refreshAnalytics && analyticsLoaded.current.workspace === workspaceRef.current && analyticsLoaded.current.month === requestMonth && Date.now() - analyticsLoaded.current.at < 300000) return;
      try {
        const analytics = await api<Report>("/api/staff/analytics" + (requestMonth ? "?month=" + requestMonth : ""), options);
        if (current()) { analyticsLoaded.current = { workspace: workspaceRef.current, month: requestMonth, at: Date.now() }; setReport(analytics); if (!panelError) setError(""); else setError("The inbox is available, but some optional dashboard panels could not be loaded."); }
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
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(false); };
    const timer = setInterval(visibleRefresh, 60000);
    document.addEventListener("visibilitychange", visibleRefresh); window.addEventListener("focus", visibleRefresh); window.addEventListener("pageshow", visibleRefresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibleRefresh); window.removeEventListener("focus", visibleRefresh); window.removeEventListener("pageshow", visibleRefresh); generation.current++; loading.current?.controller.abort(); loading.current = null; };
  }, [month, workspace, refresh]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (filter) params.set("status", filter);
      if (partnerFilter) params.set("partner", partnerFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (unresolvedOnly) params.set("unresolved", "true");
      const next = params.toString();
      if (next === searchRef.current) return;
      searchRef.current = next; generation.current++; loading.current?.controller.abort();
      setNextCursor(null); setReferrals([]); void refresh(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, filter, partnerFilter, fromDate, toDate, unresolvedOnly, refresh]);

  async function loadMore() {
    if (!nextCursor || busy === "more" || refreshing) return;
    const requestWorkspace = workspaceRef.current, requestSearch = searchRef.current, requestGeneration = generation.current;
    const params = new URLSearchParams(requestSearch); params.set("cursor", nextCursor); setBusy("more");
    try {
      const page = await api<{ referrals: Referral[]; nextCursor?: string; limited: boolean }>("/api/staff/referrals?" + params);
      if (requestWorkspace !== workspaceRef.current || requestSearch !== searchRef.current || requestGeneration !== generation.current) return;
      setReferrals(current => [...new Map([...current, ...page.referrals].map(row => [row.id, row])).values()]);
      setNextCursor(page.nextCursor || null); setLimited(page.limited);
    } catch (failure) { if (requestWorkspace === workspaceRef.current && requestGeneration === generation.current) handleError(failure); }
    finally { setBusy(""); }
  }
  async function retryAlert(id: string) {
    setBusy("retry"); setError("");
    try { await api("/api/staff/alerts/" + encodeURIComponent(id) + "/retry", { method: "POST", body: "{}" }); await refresh(); setNotice("Alert queued for another delivery attempt."); }
    catch (failure) { handleError(failure); } finally { setBusy(""); }
  }
  async function notifyReferral(id: string) {
    setBusy("notify"); setError("");
    try { await api("/api/staff/referrals/" + encodeURIComponent(id) + "/notify", { method: "POST", body: "{}" }); await refresh(); setNotice("Missing notification queued."); }
    catch (failure) { handleError(failure); } finally { setBusy(""); }
  }
  function selectMonth(value: string) { if (value === selectedMonth.current) return; selectedMonth.current = value; generation.current++; loading.current?.controller.abort(); setMonth(value); }
  function selectWorkspace(value: string) {
    workspaceRef.current = value; generation.current++; loading.current?.controller.abort(); setWorkspace(value); setSession("loading"); setError(""); setReferrals([]); setTestReferrals([]); setTestReferralsLimited(false); setTestCardId(""); setReport(null); setPartners([]); setCards([]); setOffices([]); setMembers([]); setProfile(null); setBilling(null); setCheckoutPlan("workspace"); setAlerts(null); setNextCursor(null); setHistory({}); setDetailId("");
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
    try { await api("/api/staff/business/profile", { method: "PATCH", body: JSON.stringify({ name: data.get("name"), welcomeText: data.get("welcomeText"), phone: data.get("phone"), logoUrl: data.get("logoUrl"), alertEmail: data.get("alertEmail"), acceptReferrals: data.get("acceptReferrals") === "on", etag: profile.etag }) }); setNotice("Business settings saved."); await refresh(); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function subscribe() { setBusy("billing"); setError(""); try { const response = await api<{ url: string }>("/api/staff/billing/checkout", { method: "POST", body: JSON.stringify({ plan: checkoutPlan }) }); window.location.assign(response.url); } catch (e) { handleError(e); setBusy(""); } }
  async function runTestReferral(card: CardLink) {
    setBusy("test-referral"); setError(""); setNotice("");
    try {
      const result = await api<{ ok: boolean; idempotent: boolean; referralId: string }>("/api/staff/test-referrals", { method: "POST", body: JSON.stringify({ cardCode: card.id, submissionId: crypto.randomUUID() }) });
      setNotice(`Synthetic test referral ${result.idempotent ? "was already verified" : "created"} for ${card.partnerName} · ${card.officeName}. It is excluded from the normal inbox, alerts, and reports.`);
      await refresh();
    } catch (e) { handleError(e); }
    finally { setBusy(""); }
  }
  async function manageBilling() { setBusy("billing"); setError(""); try { const response = await api<{ url: string }>("/api/staff/billing/portal", { method: "POST", body: "{}" }); window.location.assign(response.url); } catch (e) { handleError(e); setBusy(""); } }
  async function makeQr(card: CardLink) { try { setQrCard({ id: card.id, data: await QRCode.toDataURL(card.url, { width: 320, margin: 1, errorCorrectionLevel: "M" }) }); } catch { setError("Could not create the QR code. Copy the link instead."); } }
  async function testAlert() { setBusy("alert"); setNotice(""); try { await api("/api/staff/alerts/test", { method: "POST", body: "{}" }); setNotice("Test alert queued."); } catch (e) { handleError(e); } finally { setBusy(""); } }

  const selectedBusiness = businesses.find(b => b.businessId === workspace), isAdmin = selectedBusiness?.role === "Admin";
  const allowedStatuses = statuses;
  const selectedReport = report && (report.month === month || !month) ? report : null;
  const filtered = useMemo(() => referrals.filter(r => (!filter || r.status === filter) && (!partnerFilter || (r.partnerId || r.doctorCode) === partnerFilter) && (!query || `${r.name} ${r.partnerName || r.doctorName} ${r.email} ${r.phone}`.toLowerCase().includes(query.toLowerCase())) && (!fromDate || r.createdAt.slice(0, 10) >= fromDate) && (!toDate || r.createdAt.slice(0, 10) <= toDate)).sort((a, b) => {
    const overdue = overdueReferral;
    const priority = (r: Referral) => ["Completed", "Won", "Closed"].includes(r.status) ? 3 : r.status === "New" ? 0 : !r.ownerId ? 1 : overdue(r) ? 2 : 3;
    return priority(a) - priority(b) || (priority(a) < 3 ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }), [referrals, filter, partnerFilter, query, fromDate, toDate]);
  const testableCards = cards.filter(card => card.active && partners.some(partner => partner.active && partner.id === card.partnerId) && offices.some(office => office.active && office.id === card.officeId));
  const selectedTestCard = testableCards.find(card => card.id === testCardId) || testableCards[0];
  // Attention counts describe the loaded records only, matching the status tiles below.
  const attention = useMemo(() => {
    const open = referrals.filter(r => !["Completed", "Won", "Closed"].includes(r.status));
    return { newCount: open.filter(r => r.status === "New").length, unassigned: open.filter(r => r.status !== "New" && !r.ownerId).length, overdue: open.filter(overdueReferral).length };
  }, [referrals]);

  if (session === "expired" || session === "denied") return <main className="dashboard" id="main-content"><section className="card session-expired" role="alert"><h1>{session === "expired" ? "Please sign in again" : "Access denied"}</h1><p>{session === "expired" ? "Your staff session has ended. Sign in to continue." : "Your account does not have active access to this workspace. Contact its administrator."}</p><a className="session-sign-in" href="/staff/login">Sign in to the office dashboard</a></section></main>;
  if (session === "active" && !businesses.length) return <main className="dashboard" id="main-content"><section className="card no-workspace"><p className="eyebrow">STAFF ACCESS</p><h1>Workspace invitation required</h1><p className="muted">Ask a Bridgewayrefer business administrator to invite the email address you use for staff sign in.</p><a className="session-sign-in" href="/staff/login">Try another sign-in</a></section></main>;

  return <><main className="dashboard dashboard-wide" id="main-content" aria-busy={session === "loading" || refreshing}>
    <div className="dashboard-heading"><div><p className="eyebrow">BRIDGEWAYREFER STAFF WORKSPACE</p><h1>{selectedBusiness?.name || "Referral follow-up"}</h1><p className="muted">Referral requests and partner outcomes.</p></div>
      <div className="workspace-actions"><label className="business-switcher-light" htmlFor="workspace-select">Workspace<select id="workspace-select" value={workspace} onChange={e => selectWorkspace(e.target.value)}><option value="">Choose a workspace…</option>{businesses.map(b => <option value={b.businessId} key={b.businessId}>{b.name} · {b.role}</option>)}</select></label><nav className="section-nav" aria-label="Dashboard sections"><a href="#inbox">Follow-up</a><a href="#office-report">Analytics</a><a href="#management">Setup</a></nav></div>
    </div>
    <p className="error-message" role="alert">{error}</p><p className="hint" role="status">{notice}</p>
    {!workspace ? <section className="workspace-empty">Choose a workspace to view its private referrals.</section> : selectedBusiness?.signupPending ?
      <section className="card access-form">
        <h2>Finish setting up your subscription</h2>
        <p>{billing?.plan === "managed-calling" ? "Managed Calling at $400/month, including your workspace." : "Referral Workspace at $50/month."} Once Stripe confirms your payment, your referral dashboard will open here.</p>
        <div className="billing-actions">
          {isAdmin && <button className="primary" disabled={!billing?.configured || busy === "billing"} onClick={() => void subscribe()}>Continue to Stripe</button>}
          <button className="secondary" disabled={refreshing} onClick={() => void refresh()}>Check payment status</button>
        </div>
      </section> : <>
      {profile && !profile.accepting && <p className="notice">{profile.suspended ? "This workspace is paused by Bridgewayrefer. Card taps show a closed form until it is reactivated." : !profile.acceptReferrals ? "Referral intake is turned off in the business profile below." : "Referral intake opens once the subscription is active. Use Subscribe in the Billing section."}</p>}
      {isAdmin && profile && <section className="card activation-card" aria-label="Workspace activation"><div className="activation-heading"><div><p className="eyebrow">WORKSPACE SETUP</p><h2>{profile.accepting ? "Your referral intake is ready" : "Get ready for your first referral"}</h2><p>{profile.accepting ? "Your team can receive and follow up on attributed referrals." : "Complete each step in order. Your progress is saved as you set up the workspace."}</p></div><span className="activation-progress">{setupSteps.filter(step => step.complete).length} of {setupSteps.length} complete</span></div><ol className="activation-steps">{setupSteps.map((step, index) => <li key={step.label} className={step.complete ? "is-complete" : ""}><span className="activation-index" aria-hidden="true">{step.complete ? "✓" : String(index + 1).padStart(2, "0")}</span><div><strong>{step.label}</strong><p>{step.detail}</p></div>{step.testAction ? <div className="activation-test-action"><label htmlFor="test-referral-card">Test card<select id="test-referral-card" value={selectedTestCard?.id || ""} onChange={event => setTestCardId(event.target.value)} disabled={!testableCards.length}><option value="">{testableCards.length ? "Choose an active partner card" : "Set up an active partner card first"}</option>{testableCards.map(card => <option value={card.id} key={card.id}>{card.partnerName} · {card.officeName}</option>)}</select></label><button className="secondary" type="button" disabled={!selectedTestCard || busy === "test-referral"} onClick={() => selectedTestCard && void runTestReferral(selectedTestCard)}>{busy === "test-referral" ? "Checking…" : step.action}</button></div> : <a href={step.href}>{step.action}<span aria-hidden="true"> →</span></a>}</li>)}</ol><div className="activation-test-list" id="test-referrals"><h3>Isolated test referrals</h3><p>Synthetic records are visible here only. They do not enter the staff inbox, partner reports, alerts, billing, or intake.</p>{testReferralsLimited && <p className="notice">Showing the latest 200 test referrals.</p>}{testReferrals.length ? <ul>{testReferrals.map(test => <li key={test.id}><strong>{test.partnerName || "Direct referral"}</strong><span>{test.officeId} · {test.cardId} · {new Date(test.createdAt).toLocaleString("en-US", { timeZone: "America/Denver" })} MT</span></li>)}</ul> : <p className="muted">No test referrals yet.</p>}</div><p className="activation-footnote">Need physical NFC cards? <a href="/contact">Request a card quote</a>.</p></section>}
      <section className="inbox-section" id="inbox" aria-labelledby="inbox-title"><div className="section-heading"><div><p className="eyebrow">FOLLOW-UP TODAY</p><h2 id="inbox-title">Referral inbox</h2><p className="muted">New, unassigned, and overdue requests first.</p></div><button className="secondary" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh inbox ↻"}</button></div>
        <div className="attention-strip" aria-label="Loaded requests needing attention">{[["New requests", attention.newCount], ["Unassigned", attention.unassigned], ["Late follow-ups", attention.overdue]].map(([label, count]) => <div className={"attention-tile" + (Number(count) > 0 ? " is-warn" : "")} key={String(label)}><span>{label}</span><b>{count}</b></div>)}</div>
        <div className="metrics" role="group" aria-label="Filter referrals by status">{["", ...allowedStatuses].map(status => <button key={status} className="metric" aria-pressed={filter === status} aria-controls="referrals" onClick={() => setFilter(status)}>{status || "Loaded requests"}<b>{status ? referrals.filter(r => r.status === status).length : referrals.length}</b></button>)}</div>
        <div className="followup-toolbar"><label htmlFor="inbox-search">Search<input id="inbox-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, email, partner"/></label><label htmlFor="partner-filter">Partner<select id="partner-filter" value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}><option value="">All partners</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label htmlFor="received-from">Received from (UTC)<input id="received-from" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}/></label><label htmlFor="received-to">Received to (UTC)<input id="received-to" type="date" value={toDate} onChange={e => setToDate(e.target.value)}/></label><label htmlFor="status-filter">Status<select id="status-filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="">All statuses</option>{allowedStatuses.map(s => <option key={s}>{s}</option>)}</select></label><label className="check"><input type="checkbox" checked={unresolvedOnly} onChange={e => setUnresolvedOnly(e.target.checked)} />Unresolved only</label><span id="inbox-view" role="status">{filtered.length} shown{updated ? ` · Updated ${updated}` : ""}</span></div>
        {limited && <p className="notice">More records match this search. Load more below. Filters search all retained referrals; counts describe loaded records.</p>}
        <div className="referrals" id="referrals">{!filtered.length && <p className="empty">{session === "loading" ? "Loading requests…" : "No requests match these filters."}</p>}{filtered.map(r => {
          const isOverdue = overdueReferral(r);
          const needsFollowup = !["Completed", "Won", "Closed"].includes(r.status) && (r.status === "New" || !r.ownerId || isOverdue);
          const nextAction = ["Completed", "Won", "Closed"].includes(r.status) ? r.status : r.nextAction || (r.status === "New" ? "Contact within one business day" : r.status === "Contacted" ? "Agree on a next step" : r.status === "Scheduled" ? "Confirm the next step" : r.status);
          const displayName = r.firstName || r.lastName ? [r.firstName, r.lastName].filter(Boolean).join(" ") : r.name;
          return <article className="referral" key={r.id}><div className="title-row"><h2>{displayName}</h2><label>Status<select className="status" aria-label={`Status for ${displayName}`} value={r.status} disabled={busy === r.id} onChange={e => void changeStatus(r, e.target.value)}>{allowedStatuses.map(s => <option key={s}>{s}</option>)}</select></label></div>
            <dl className="facts">{[["Site", r.doctorName || "Direct request"], ["Partner", r.partnerName || "Direct request"], ["Card", r.cardId || r.doctorCode || "Direct request"], ["Received", `${new Date(r.createdAt).toLocaleString("en-US", { timeZone: "America/Denver" })} MT`], ...(r.updatedAt ? [["Updated", `${new Date(r.updatedAt).toLocaleString("en-US", { timeZone: "America/Denver" })} MT`]] : []), ...(r.serviceType ? [["Service", r.serviceType]] : []), ...(r.postalCode ? [["Postal code", r.postalCode]] : [])].map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
            <div className="details"><a href={"mailto:" + encodeURIComponent(r.email)}>{r.email}</a><a href={"tel:" + r.phone.replace(/[^+\d]/g, "")}>{r.phone}</a></div>{r.notes && <p className="notes">{r.notes}</p>}
            <div className="referral-action">{needsFollowup && <span className="referral-priority">{isOverdue ? "Overdue" : r.status === "New" ? "New request" : "Unassigned"}</span>}<span className="next-action">Next: {nextAction}</span><label htmlFor={`owner-${r.id}`}>Owner<select id={`owner-${r.id}`} value={r.ownerId || ""} disabled={busy === "owner-" + r.id} onChange={e => void assign(r, members.find(m => m.id === e.target.value))}><option value="">Unassigned</option>{members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label><button className="secondary detail-toggle" aria-expanded={detailId === r.id} onClick={() => void showHistory(r.id)}>Contact &amp; history</button></div>
            {detailId === r.id && <div className="referral-history"><FollowUpEditor key={r.id + r.etag} referral={r} onSaved={refresh} />{r.nextActionAt && <p>Follow-up due: {new Date(r.nextActionAt).toLocaleString()}</p>}{isAdmin && <button className="secondary" disabled={!alerts?.enabled || busy === "notify"} onClick={() => void notifyReferral(r.id)}>Queue missing staff notification</button>}<strong>Status history</strong>{!history[r.id] ? <p role="status">Loading history…</p> : history[r.id].length ? <ol>{history[r.id].map((item, index) => <li key={index}>{item.status} · {new Date(item.changedAt).toLocaleString("en-US", { timeZone: "America/Denver" })} MT · {item.actor}</li>)}</ol> : <p>No status changes yet.</p>}</div>}
          </article>;
        })}</div>
        {nextCursor && <div className="pagination"><button className="secondary" disabled={refreshing || busy === "more"} onClick={() => void loadMore()}>{busy === "more" ? "Loading…" : "Load more referrals"}</button></div>}
      </section>
      {isAdmin && <OfficeReport report={selectedReport} availableMonths={report?.availableMonths} month={month} onMonth={selectMonth}/>}
      <div className="management-grid" id="management"><section className="card doctors"><p className="eyebrow">REFERRAL NETWORK</p><h2>Partners, offices &amp; cards</h2><p className="muted">Each NFC card links to one referring partner. Bridgewayrefer issues and activates the physical cards; copy a link or QR code below.</p>
        {isAdmin && <><form className="inline" onSubmit={createPartner}><label htmlFor="partner-name">Add partner<input id="partner-name" name="name" maxLength={120} required placeholder="Builder or referring office"/></label><button className="secondary" disabled={busy === "partner"}>Add partner</button></form><div className="form-grid"><form className="inline" onSubmit={createOffice}><label htmlFor="office-name">Add receiving office<input id="office-name" name="name" maxLength={120} required placeholder="Office name"/></label><button className="secondary" disabled={busy === "office"}>Add office</button></form></div></>}
        <div className="partner-card-list">{cards.map(card => <article className="card-row" key={card.id}><div><strong>{card.partnerName} · {card.officeName}</strong><small>{card.active ? "Active" : "Inactive"} · {card.url}</small></div><div className="card-row-actions"><button className="secondary" onClick={() => void navigator.clipboard.writeText(card.url).then(() => setNotice("Referral link copied.")).catch(() => setError("Copy unavailable. Select the link to copy it manually."))}>Copy link</button><button className="secondary" onClick={() => void makeQr(card)}>QR code</button></div>{qrCard?.id === card.id && <div className="qr-download"><img src={qrCard.data} alt={`QR code for ${card.partnerName}`}/><a href={qrCard.data} download={`bridgewayrefer-${card.id}.png`}>Download QR PNG</a></div>}</article>)}</div>
        <div className="partner-card-list"><p className="eyebrow">PARTNERS</p>{partners.map(p => <div className="card-row" key={p.id}><strong>{p.name}</strong><small>{p.active ? "Active" : "Inactive"}</small></div>)}</div>
        <div className="partner-card-list"><p className="eyebrow">RECEIVING OFFICES</p>{offices.map(o => <div className="card-row" key={o.id}><strong>{o.name}</strong><small>{o.active ? "Active" : "Inactive"}</small></div>)}</div>
      </section>
      <div className="management-stack">
        {isAdmin && profile && <section className="card"><p className="eyebrow">PUBLIC INTAKE</p><h2>Business profile</h2><form className="form-grid" onSubmit={saveProfile}><label htmlFor="profile-name">Business name<input id="profile-name" name="name" maxLength={120} defaultValue={profile.name} required/></label><label className="span-two" htmlFor="profile-welcome">Form welcome<input id="profile-welcome" name="welcomeText" maxLength={500} defaultValue={profile.welcomeText}/></label><label htmlFor="profile-phone">Business phone<input id="profile-phone" name="phone" maxLength={40} defaultValue={profile.phone}/></label><label htmlFor="profile-logo">Logo URL<input id="profile-logo" name="logoUrl" maxLength={500} defaultValue={profile.logoUrl} placeholder="https://…"/></label><label className="span-two" htmlFor="profile-alert">New-referral alert email<input id="profile-alert" name="alertEmail" type="email" maxLength={254} defaultValue={profile.alertEmail} placeholder="frontdesk@yourbusiness.com"/></label><label className="check span-two"><input type="checkbox" name="acceptReferrals" defaultChecked={profile.acceptReferrals}/><span>Accept referral requests from our cards.</span></label><button className="primary span-two" disabled={busy === "profile"}>Save business profile</button></form></section>}
        {isAdmin && <section className="card"><p className="eyebrow">INVITE-ONLY ACCESS</p><h2>Staff access</h2><form className="inline" onSubmit={inviteMember}><label htmlFor="invite-email">Invite email<input id="invite-email" name="email" type="email" maxLength={254} required placeholder="teammate@business.com"/></label><label htmlFor="invite-role">Role<select id="invite-role" name="role"><option>Staff</option><option>Admin</option></select></label><button className="secondary" disabled={busy === "invite"}>Create invite</button></form>{inviteLink && <p className="invite-link">Invite URL <a href={inviteLink}>{inviteLink}</a><button className="secondary" onClick={() => void navigator.clipboard.writeText(inviteLink)}>Copy</button></p>}<div className="partner-card-list">{members.map(m => <div className="card-row" key={m.id}><div><strong>{m.name}</strong><small>{m.email} · {m.role}</small></div><button className="secondary" disabled={busy === "member-" + m.id} onClick={() => void revokeMember(m)}>Revoke access</button></div>)}{invitations.filter(i => i.state === "Pending").map(i => <div className="card-row" key={i.id}><div><strong>{i.email}</strong><small>Invite pending · {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}</small></div><button className="secondary" disabled={busy === "invite-" + i.id} onClick={() => void cancelInvitation(i)}>Cancel invite</button></div>)}</div></section>}
        {isAdmin && <section className="card" id="billing"><p className="eyebrow">BUSINESS SUBSCRIPTION</p><h2>Billing</h2><div className="billing-price"><strong>${billing?.amountUsd ?? 50}</strong><span>{billing?.plan === "managed-calling" ? "Managed Calling, total per business / month" : "Workspace / business / month"}</span></div>{billing && !["active", "trialing", "past_due"].includes(billing.status) && <label className="billing-plan-select">Plan for next subscription<select value={checkoutPlan} onChange={event => setCheckoutPlan(event.target.value as "workspace" | "managed-calling")}><option value="workspace">Workspace - $50/month</option><option value="managed-calling" disabled={!billing.managedCallingConfigured}>Managed Calling - $400/month{!billing.managedCallingConfigured ? " (not configured)" : ""}</option></select></label>}<p className="muted">Status: <b>{billing?.status || "Loading"}</b>{billing?.renewalAt ? ` · Renews ${new Date(billing.renewalAt).toLocaleDateString()}` : ""}{billing?.cancelAtPeriodEnd ? " · Cancels at period end" : ""}</p><div className="billing-actions"><button className="primary" disabled={!billing?.configured || billing?.billingExempt || busy === "billing" || ["active", "trialing", "past_due"].includes(billing?.status || "")} onClick={() => void subscribe()}>Subscribe</button><button className="secondary" disabled={!billing?.customerLinked || busy === "billing"} onClick={() => void manageBilling()}>Manage Billing</button></div>{billing?.billingExempt && <p className="hint">Billing is covered by Bridgewayrefer for this workspace.</p>}{billing && !billing.configured && <p className="hint">Online billing is not available yet. Contact Bridgewayrefer.</p>}{billing?.testMode && <p className="hint">Stripe test mode: no real charges.</p>}{billing?.status === "past_due" && <p className="notice">Your last payment failed. Update your card in Manage Billing to keep referrals flowing.</p>}</section>}
        <section className="card email-settings"><p className="eyebrow">STAY INFORMED</p><h2>Email alerts</h2><p role="status">{alerts ? alerts.enabled ? `Sending to ${alerts.recipient}. ${alerts.waiting} waiting, ${alerts.retrying} retrying.` : "Add an alert email in the business profile to get notified of new referrals." : "Checking email settings…"}</p>{isAdmin && <button className="secondary" disabled={!alerts?.enabled || busy === "alert"} onClick={() => void testAlert()}>Send test alert ↗</button>}{alerts && alerts.smtpConfigured === false && <p className="notice">Email delivery is unavailable. Contact BridgeWay to complete delivery setup.</p>}{!!alerts?.failed && <div className="alert-failure" role="status"><p>{alerts.failed} alerts failed after repeated delivery attempts.</p>{isAdmin && alerts.failures?.map(alert => <p key={alert.id}>{alert.attempts} attempts <button className="secondary" disabled={busy === "retry"} onClick={() => void retryAlert(alert.id)}>Retry failed alert</button></p>)}</div>}{!!alerts?.stalled && <p role="status">{alerts.stalled} alerts are waiting for recovery after an interrupted attempt.</p>}<p className="hint">Alerts contain a dashboard link. Referral details stay in the dashboard. Email server acceptance does not confirm inbox delivery.</p></section>
      </div></div>
    </>}
  </main></>;
}




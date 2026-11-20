"use client";
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import AccountMenu from "./AccountMenu";
import { signOut as sharedSignOut, type Account } from "../lib/account";
import QRCode from "qrcode";
import { api, ApiError, statuses, WORKSPACE_KEY, type Alerts, type Business, type Partner, type Referral, type ReferralHistory, type ReferralTotals, type Report, type PublicConfig } from "../lib/api";
import FollowUpEditor from "./FollowUpEditor";
import { isOverdue as overdueReferral } from "../lib/follow-up";
import StaffInvitation from "./StaffInvitation";
import OfficeReport from "./OfficeReport";
import PatientForm from "./PatientForm";

type Office = { logoUrl?: string; id: string; name: string; active: boolean; etag: string };
type CardLink = { id: string; partnerId: string; partnerName: string; officeId?: string; officeName: string; active: boolean; etag: string; url: string };
type Member = { id: string; name: string; email: string; role: string; etag: string };
type BusinessProfile = { name: string; officeName: string; welcomeText: string; phone: string; logoUrl: string; acceptReferrals: boolean; accepting: boolean; suspended: boolean; alertEmail: string; billingStatus: string; monthlyPriceUsd: number; etag: string };
type Billing = { plan?: string; amountUsd: number; interval: string; status: string; billingExempt: boolean; renewalAt?: string; cancelAtPeriodEnd: boolean; configured: boolean; managedCallingConfigured?: boolean; testMode: boolean; customerLinked: boolean };
type Invitation = { id: string; email: string; role: string; state: string; expiresAt: string; etag: string };
type Session = { businessId?: string | null; role: string; businesses: Business[]; account?: Account; platformAdmin?: boolean };

const NAV_ICONS: Record<string, string[]> = {
  cards: ["M3 6h18v12H3z", "M7 14h4", "M15 9.5a3 3 0 0 1 0 5", "M18 8a6 6 0 0 1 0 8"],
  settings: ["M4 6h10", "M18 6h2", "M4 12h4", "M12 12h8", "M4 18h12", "M20 18h0", "M16 4v4", "M10 10v4", "M18 16v4"],
  overview: ["M3 12 12 4l9 8", "M5 10v10h14V10"],
  inbox: ["M4 4h16v12h-5l-3 3-3-3H4z"],
  analytics: ["M4 20V10", "M10 20V4", "M16 20v-8", "M22 20H2"],
  setup: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"],
  management: ["M3 8h18v12H3z", "M3 12h18", "M8 4h8v4H8z"],
  access: ["M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M22 20v-2a4 4 0 0 0-3-3.9"],
  billing: ["M2 6h20v12H2z", "M2 10h20"],
  admin: ["M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z", "M9 12l2 2 4-4"],
  signout: ["M9 4H4v16h5", "M16 8l4 4-4 4", "M20 12H9"],
};
function NavIcon({ name }: { name: string }) {
  return <svg className="staff-nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(NAV_ICONS[name] || []).map(d => <path key={d} d={d} />)}</svg>;
}

export default function StaffPage() {
  return <StaffInvitation><StaffDashboard /></StaffInvitation>;
}

function StaffDashboard() {
  const [editingOffice, setEditingOffice] = useState("");
  const [preview, setPreview] = useState<{ workspace: string; config: PublicConfig } | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]), [partners, setPartners] = useState<Partner[]>([]), [offices, setOffices] = useState<Office[]>([]), [cards, setCards] = useState<CardLink[]>([]), [members, setMembers] = useState<Member[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]), [profile, setProfile] = useState<BusinessProfile | null>(null), [billing, setBilling] = useState<Billing | null>(null), [invitations, setInvitations] = useState<Invitation[]>([]), [alerts, setAlerts] = useState<Alerts | null>(null), [report, setReport] = useState<Report | null>(null);
  const [month, setMonth] = useState(""), [workspace, setWorkspace] = useState(""), [partnerFilter, setPartnerFilter] = useState(""), [query, setQuery] = useState(""), [fromDate, setFromDate] = useState(""), [toDate, setToDate] = useState("");
  const [checkoutPlan, setCheckoutPlan] = useState<"workspace" | "managed-calling">("workspace");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [session, setSession] = useState<"loading" | "active" | "expired" | "denied">("loading"), [busy, setBusy] = useState(""), [refreshing, setRefreshing] = useState(false);
  const [detailId, setDetailId] = useState(""), [history, setHistory] = useState<Record<string, ReferralHistory[]>>({}), [qrCard, setQrCard] = useState<{ id: string; data: string } | null>(null), [inviteLink, setInviteLink] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null), [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [totals, setTotals] = useState<ReferralTotals | null>(null), [attentionOnly, setAttentionOnly] = useState(false);
  const searchRef = useRef("");
  const [due, setDue] = useState("");
  const [readView, setReadView] = useState<"All" | "Unread" | "Read">("All");
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const readKey = workspace ? `bridgeway:referral-read:${workspace}` : "";

  useEffect(() => {
    try {
      const saved: unknown = readKey ? JSON.parse(localStorage.getItem(readKey) ?? "[]") : [];
      setReadIds(new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []));
    } catch {
      setReadIds(new Set());
    }
  }, [readKey]);
  const [historyError, setHistoryError] = useState("");
  const historyRequest = useRef(0);
  const analyticsLoaded = useRef({ workspace: "", month: "", at: 0 });
  const generation = useRef(0), stopped = useRef(false), selectedMonth = useRef(""), workspaceRef = useRef(""), loading = useRef<{ month: string; workspace: string; controller: AbortController } | null>(null);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      stopped.current = true; generation.current++; loading.current?.controller.abort(); setReferrals([]); setPartners([]); setOffices([]); setCards([]); setMembers([]); setReport(null); setAlerts(null); setHistory({}); setDetailId(""); historyRequest.current++; setSession(e.status === 401 ? "expired" : "denied");
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
      const available = auth.businesses || []; setBusinesses(available); setSession("active"); setPlatformAdmin(Boolean(auth.platformAdmin)); setAccount(auth.account ?? null);
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
      const inbox = await api<{ referrals: Referral[]; limited: boolean; nextCursor?: string; totals?: ReferralTotals | null }>("/api/staff/referrals" + (requestSearch ? "?" + requestSearch : ""), options);
      if (!current()) return;
      setReferrals(inbox.referrals); setTotals(inbox.totals ?? null); setNextCursor(inbox.nextCursor || null); setError("");

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
      if (billingData.status === "fulfilled") { setBilling(billingData.value); setCheckoutPlan(billingData.value.plan === "managed-calling" ? "managed-calling" : "workspace"); }
      if (alertData.status === "fulfilled") setAlerts(alertData.value);
      if (inviteData.status === "fulfilled") setInvitations(inviteData.value.invitations);
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
      if (partnerFilter) params.set("partner", partnerFilter);
      if (due) params.set("due", due);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (unresolvedOnly) params.set("unresolved", "true");
      if (attentionOnly) params.set("attention", "true");
      const next = params.toString();
      if (next === searchRef.current) return;
      searchRef.current = next; generation.current++; loading.current?.controller.abort();
      setNextCursor(null); setReferrals([]); setTotals(null); void refresh(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, partnerFilter, due, fromDate, toDate, unresolvedOnly, attentionOnly, refresh]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  async function loadMore() {
    if (!nextCursor || busy === "more" || refreshing) return;
    const requestWorkspace = workspaceRef.current, requestSearch = searchRef.current, requestGeneration = generation.current;
    const params = new URLSearchParams(requestSearch); params.set("cursor", nextCursor); setBusy("more");
    try {
      const page = await api<{ referrals: Referral[]; nextCursor?: string; limited: boolean }>("/api/staff/referrals?" + params);
      if (requestWorkspace !== workspaceRef.current || requestSearch !== searchRef.current || requestGeneration !== generation.current) return;
      setReferrals(current => [...new Map([...current, ...page.referrals].map(row => [row.id, row])).values()]);
      setNextCursor(page.nextCursor || null);
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
    setPreview(null); setEditingOffice("");
    workspaceRef.current = value; generation.current++; loading.current?.controller.abort(); setWorkspace(value); setSession("loading"); setError(""); setReferrals([]); setTotals(null); setReport(null); setPartners([]); setCards([]); setOffices([]); setMembers([]); setProfile(null); setBilling(null); setCheckoutPlan("workspace"); setAlerts(null); setNextCursor(null); setHistory({}); setDetailId(""); historyRequest.current++; setHistoryError("");
    if (value) localStorage.setItem(WORKSPACE_KEY, value); else localStorage.removeItem(WORKSPACE_KEY);
  }
  async function changeStatus(referral: Referral, status: string) {
    setBusy(referral.id); setError("");
    try { await api("/api/staff/referrals/" + referral.id, { method: "PATCH", body: JSON.stringify({ status, etag: referral.etag }) }); await refresh(false); setNotice("Referral status updated."); if (detailId === referral.id) await loadHistory(referral.id); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function assign(referral: Referral, owner: Member | undefined) {
    setBusy("owner-" + referral.id); setError("");
    try { await api("/api/staff/referrals/" + referral.id + "/assignment", { method: "PATCH", body: JSON.stringify({ ownerId: owner?.id || null, ownerName: owner?.name || null, etag: referral.etag }) }); await refresh(false); setNotice(owner ? "Staff assignment updated." : "Referral is now unassigned."); if (detailId === referral.id) await loadHistory(referral.id); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function loadHistory(referralId: string) {
    const request = ++historyRequest.current, requestWorkspace = workspaceRef.current;
    setHistoryError("");
    setHistory(current => { const next = { ...current }; delete next[referralId]; return next; });
    try {
      const result = await api<{ history: ReferralHistory[] }>("/api/staff/referrals/" + encodeURIComponent(referralId) + "/history");
      if (request === historyRequest.current && requestWorkspace === workspaceRef.current && !stopped.current) setHistory(current => ({ ...current, [referralId]: result.history }));
    } catch (e) {
      if (request !== historyRequest.current || requestWorkspace !== workspaceRef.current) return;
      if (e instanceof ApiError && [401, 403].includes(e.status)) handleError(e);
      else setHistoryError(e instanceof Error ? e.message : "History could not be loaded.");
    }
  }
  function showHistory(referralId: string) {
    if (!readIds.has(referralId)) {
      const next = new Set(readIds).add(referralId);
      setReadIds(next);
      try {
        if (readKey) localStorage.setItem(readKey, JSON.stringify([...next]));
      } catch {
        // The current session can still track read referrals when storage is unavailable.
      }
    }
    setDetailId(referralId);
    void loadHistory(referralId);
  }
  function clearFilters() {
    setQuery(""); setPartnerFilter(""); setDue(""); setFromDate(""); setToDate(""); setUnresolvedOnly(false); setAttentionOnly(false);
  }
  async function createPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setBusy("partner"); setError("");
    try { await api("/api/staff/partners", { method: "POST", body: JSON.stringify({ name: new FormData(form).get("name") }) }); form.reset(); await refresh(); setNotice("Partner added."); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function saveOfficeLogo(event: FormEvent<HTMLFormElement>, office: Office) {
    event.preventDefault();
    const logoUrl = new FormData(event.currentTarget).get("logoUrl");
    setBusy("office-logo"); setError("");
    try {
      await api(`/api/staff/offices/${encodeURIComponent(office.id)}`, {
        method: "PATCH", body: JSON.stringify({ logoUrl, etag: office.etag }),
      });
      setEditingOffice("");
      await refresh();
      setNotice("Office logo saved.");
    } catch (e) { handleError(e); }
    finally { setBusy(""); }
  }

  async function openPatientPreview(card: CardLink) {
    const requestWorkspace = workspaceRef.current;
    setBusy("patient-preview"); setError("");
    try {
      const config = await api<PublicConfig>(`/api/staff/cards/${encodeURIComponent(card.id)}/preview`);
      if (requestWorkspace === workspaceRef.current) setPreview({ workspace: requestWorkspace, config });
    } catch (e) {
      if (requestWorkspace === workspaceRef.current) handleError(e);
    } finally { setBusy(""); }
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
  async function manageBilling() { setBusy("billing"); setError(""); try { const response = await api<{ url: string }>("/api/staff/billing/portal", { method: "POST", body: "{}" }); window.location.assign(response.url); } catch (e) { handleError(e); setBusy(""); } }
  async function makeQr(card: CardLink) { try { setQrCard({ id: card.id, data: await QRCode.toDataURL(card.url, { width: 320, margin: 1, errorCorrectionLevel: "M" }) }); } catch { setError("Could not create the QR code. Copy the link instead."); } }
  async function testAlert() { setBusy("alert"); setNotice(""); try { await api("/api/staff/alerts/test", { method: "POST", body: "{}" }); setNotice("Test alert queued."); } catch (e) { handleError(e); } finally { setBusy(""); } }
  async function signOut() {
    await sharedSignOut();
  }

  const selectedBusiness = businesses.find(b => b.businessId === workspace), isAdmin = selectedBusiness?.role === "Admin";
  const allowedStatuses = statuses.filter(status => status !== "Won" && status !== "Closed");
  useEffect(() => {
    function syncView() {
      let section = window.location.hash.slice(1);
      const sharedViews = ["overview", "inbox", "management", "cards", "settings"];
      const adminViews = ["office-report", "staff-access", "billing"];
      if (section === "workspace-setup") {
        section = "overview";
        window.history.replaceState(window.history.state, "", "#overview");
      }
      const target = section === "referrals" ? "inbox" : section;
      setActiveSection(sharedViews.includes(target) || (isAdmin && adminViews.includes(target)) ? target : "overview");
    }
    syncView();
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, [isAdmin]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeSection]);











  const selectedReport = report && (report.month === month || !month) ? report : null;
  // Keep the server order while applying the browser's read history.
  const filtered = readView === "All" ? referrals : referrals.filter(referral =>
    readView === "Read" ? readIds.has(referral.id) : !readIds.has(referral.id) || detailId === referral.id
  );
  const hasFilters = Boolean(query.trim() || partnerFilter || due || fromDate || toDate || unresolvedOnly || attentionOnly);
  const needsAttentionTotal = totals?.needsAttention ?? null;
  const attentionReferrals = referrals.filter(referral =>
    !["Completed", "Won", "Closed"].includes(referral.status) &&
    (referral.status === "New" || !referral.ownerId || overdueReferral(referral))
  ).sort((a, b) => Number(overdueReferral(b)) - Number(overdueReferral(a)) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (session === "active" && preview?.workspace === workspace) return <>
    <div className="bw-intake-header" role="region" aria-label="Preview controls">
      <p><strong>Preview</strong> ? Submissions are disabled.</p>
      <button className="secondary" autoFocus onClick={() => setPreview(null)}>Back to cards</button>
    </div>
    <PatientForm config={preview.config} preview />
  </>;
  if (session === "expired" || session === "denied") return <main className="dashboard" id="main-content"><section className="card session-expired" role="alert"><img className="session-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={100} height={34} /><h1>{session === "expired" ? "Please sign in again" : "Access denied"}</h1><p>{session === "expired" ? "Your session has ended. Sign in to continue." : "Your account does not have access to this workspace. Contact its administrator."}</p><a className="session-sign-in" href="/sign-in">Sign in</a></section></main>;
  if (session === "active" && !businesses.length) return <main className="dashboard" id="main-content"><section className="card no-workspace"><img className="session-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={100} height={34} /><p className="eyebrow">STAFF ACCESS</p><h1>Invitation required</h1><p className="muted">Ask your workspace administrator to invite the email you sign in with.</p><a className="session-sign-in" href="/sign-in">Try another sign-in</a></section></main>;

  return <main className="staff-shell" id="main-content" aria-busy={session === "loading" || refreshing}>
    <button className={`staff-sidebar-scrim${sidebarOpen ? " is-visible" : ""}`} aria-label="Dismiss navigation overlay" tabIndex={sidebarOpen ? 0 : -1} onClick={() => setSidebarOpen(false)} />
    <aside className={`staff-sidebar${sidebarOpen ? " is-open" : ""}`} aria-label="Staff workspace navigation">
      <a className="staff-sidebar-brand" href="/" aria-label="BridgeWayRefer home">
        <picture>
          <source media="(760px < width < 1024px)" srcSet="/brand-mark-square.png" width={256} height={256} />
          <img src="/brand-logo.png" alt="BridgeWayRefer" width={1508} height={518} />
        </picture>
      </a>
      <nav className="staff-sidebar-nav" aria-label="Workspace sections">
        <a href="#overview" className={activeSection === "overview" ? "is-active" : undefined} aria-current={activeSection === "overview" ? "location" : undefined} aria-label="Overview" title="Overview" onClick={() => setSidebarOpen(false)}><NavIcon name="overview" /><span className="staff-nav-label">Overview</span></a>
        <a href="#inbox" className={activeSection === "inbox" ? "is-active" : undefined} aria-current={activeSection === "inbox" ? "location" : undefined} aria-label="Referral inbox" title="Referral inbox" onClick={() => setSidebarOpen(false)}><NavIcon name="inbox" /><span className="staff-nav-label">Referral inbox</span></a>
        {isAdmin && <a href="#office-report" className={activeSection === "office-report" ? "is-active" : undefined} aria-current={activeSection === "office-report" ? "location" : undefined} aria-label="Analytics" title="Analytics" onClick={() => setSidebarOpen(false)}><NavIcon name="analytics" /><span className="staff-nav-label">Analytics</span></a>}
        <a href="#management" className={activeSection === "management" ? "is-active" : undefined} aria-current={activeSection === "management" ? "location" : undefined} aria-label="Partners and locations" title="Partners and locations" onClick={() => setSidebarOpen(false)}><NavIcon name="management" /><span className="staff-nav-label">Partners and locations</span></a>
        <a href="#cards" className={activeSection === "cards" ? "is-active" : undefined} aria-current={activeSection === "cards" ? "location" : undefined} aria-label="Cards" title="Cards" onClick={() => setSidebarOpen(false)}><NavIcon name="cards" /><span className="staff-nav-label">Cards</span></a>
        <a href="#settings" className={activeSection === "settings" ? "is-active" : undefined} aria-current={activeSection === "settings" ? "location" : undefined} aria-label="Settings" title="Settings" onClick={() => setSidebarOpen(false)}><NavIcon name="settings" /><span className="staff-nav-label">Settings</span></a>
        {isAdmin && <a href="#staff-access" className={activeSection === "staff-access" ? "is-active" : undefined} aria-current={activeSection === "staff-access" ? "location" : undefined} aria-label="Team" title="Team" onClick={() => setSidebarOpen(false)}><NavIcon name="access" /><span className="staff-nav-label">Team</span></a>}
        {isAdmin && <a href="#billing" className={activeSection === "billing" ? "is-active" : undefined} aria-current={activeSection === "billing" ? "location" : undefined} aria-label="Billing" title="Billing" onClick={() => setSidebarOpen(false)}><NavIcon name="billing" /><span className="staff-nav-label">Billing</span></a>}
        {platformAdmin && <a href="/admin" className="staff-sidebar-admin-link" aria-label="Platform admin" title="Platform admin" onClick={() => setSidebarOpen(false)}><NavIcon name="admin" /><span className="staff-nav-label">Platform admin</span></a>}
      </nav>
      <button className="staff-sidebar-signout" type="button" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}><NavIcon name="signout" /><span className="staff-nav-label">Sign out</span></button>
    </aside>
    <div className="staff-main-column">
      <header className="staff-topbar">
        <button className="staff-menu-toggle" aria-label={sidebarOpen ? "Close navigation" : "Open navigation"} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(value => !value)}><span aria-hidden="true">☰</span></button>
        <label className="staff-workspace-label" htmlFor="workspace-select"><span className="sr-only">Workspace</span><select id="workspace-select" value={workspace} onChange={e => selectWorkspace(e.target.value)}><option value="">Choose a workspace…</option>{businesses.map(b => <option value={b.businessId} key={b.businessId}>{b.name} · {b.role}</option>)}</select></label>
        <div className="staff-topbar-user"><AccountMenu account={account} area="staff" platformAdmin={platformAdmin} role={businesses.find(b => b.businessId === workspace)?.role} workspaces={businesses} currentWorkspace={workspace} onSwitchWorkspace={selectWorkspace} /></div>
      </header>
      <div className="staff-content">
    <p className="error-message" role="alert">{error}</p><p className="hint" role="status">{notice}</p>
    {activeSection === "overview" && <>    <section className="staff-overview" id="overview" aria-labelledby="overview-title">
      <div className="staff-page-heading"><div><p className="eyebrow">YOUR WORKSPACE AT A GLANCE</p><h1 id="overview-title">Referral overview</h1><p>Track your referral activity and keep the next conversation moving.</p></div><div className="staff-overview-month"><label className="sr-only" htmlFor="overview-month">Overview month</label><select id="overview-month" value={month || selectedReport?.month || ""} onChange={e => selectMonth(e.target.value)} disabled={!report?.availableMonths?.length}>{!report?.availableMonths?.length && <option value="">Loading months…</option>}{report?.availableMonths?.map(value => <option key={value} value={value}>{new Date(value + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</option>)}</select></div></div>
      <div className="staff-overview-grid">
        <div className="staff-overview-metrics" aria-live="polite">
          <article className="staff-overview-metric"><span>Card taps</span><strong>{selectedReport?.linkOpens ?? "—"}</strong></article>
          <article className="staff-overview-metric"><span>Forms received</span><strong>{selectedReport?.total ?? "—"}</strong></article>
          <article className="staff-overview-metric"><span>Completed outcomes</span><strong>{selectedReport?.outcomes ?? "—"}</strong></article>
          <article className="staff-overview-metric"><span>Needs follow-up</span><strong>{needsAttentionTotal ?? "—"}</strong><small>New, unassigned or overdue</small></article>
        </div>
        <section className="staff-activity-panel" aria-labelledby="staff-activity-title">
          <div className="staff-activity-heading"><h2 id="staff-activity-title">Monthly referral activity</h2><div className="staff-chart-legend"><span><i className="opens-key"/>Card taps</span><span><i className="forms-key"/>Forms received</span></div></div>
          {!selectedReport ? <p className="staff-chart-empty" role="status">{session === "loading" || refreshing ? "Loading monthly activity…" : "Monthly activity is not available."}</p> : !selectedReport.trend?.length ? <p className="staff-chart-empty">No monthly activity to display.</p> : <><table className="sr-only"><caption>Monthly card taps and forms received</caption><thead><tr><th scope="col">Month</th><th scope="col">Card taps</th><th scope="col">Forms received</th></tr></thead><tbody>{selectedReport.trend.map(item => <tr key={item.month}><th scope="row">{new Date(item.month + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</th><td>{item.opens}</td><td>{item.total}</td></tr>)}</tbody></table><div className="staff-bar-chart" aria-hidden="true">
            {selectedReport.trend?.map(item => { const peak = Math.max(1, ...selectedReport.trend.flatMap(row => [row.opens, row.total])); const label = new Date(item.month + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }); return <div className="staff-bar-month" key={item.month} aria-label={`${label}: ${item.opens} opens, ${item.total} forms`}>
              <div className="staff-bars"><span className="staff-bar staff-bar-opens" style={{ height: `${Math.max(3, item.opens / peak * 100)}%` }} /><span className="staff-bar staff-bar-forms" style={{ height: `${Math.max(3, item.total / peak * 100)}%` }} /></div><span className="staff-bar-label">{label}</span>
            </div>; })}
          </div></>}
        </section>
        <section className="card staff-attention" aria-labelledby="staff-attention-title">
          <div className="staff-attention-heading">
            <h2 id="staff-attention-title">Needs attention</h2>
            <span>{needsAttentionTotal ?? "—"}</span>
          </div>
          {attentionReferrals.length ? (
            <ul>{attentionReferrals.slice(0, 5).map(referral => (
              <li key={referral.id}>
                <span><strong>{referral.name}</strong><small>{referral.partnerName || "Direct request"}</small></span>
                <span className={overdueReferral(referral) ? "staff-badge is-overdue" : "staff-badge"}>
                  {overdueReferral(referral) ? "Overdue" : referral.status === "New" ? "New" : "Unassigned"}
                </span>
              </li>
            ))}</ul>
          ) : <p className="muted">No loaded referrals need follow-up.</p>}
          <a href="#inbox" onClick={() => { clearFilters(); setAttentionOnly(true); }}>Review referrals that need attention →</a>
        </section>
      </div>
    </section></>}
    {!workspace ? <section className="workspace-empty">Choose a workspace to see its referrals.</section> : selectedBusiness?.signupPending ?
      <section className="card access-form">
        <h2>Finish setting up your subscription</h2>
        <p>{billing?.plan === "managed-calling" ? "Managed Calling, billed per business." : "Referral Workspace, billed per business."} Your dashboard opens once payment is confirmed.</p>
        <div className="billing-actions">
          {isAdmin && <button className="primary" disabled={!billing?.configured || busy === "billing"} onClick={() => void subscribe()}>Continue to checkout</button>}
          <button className="secondary" disabled={refreshing} onClick={() => void refresh()}>Check payment status</button>
        </div>
      </section> : <>
      {profile && !profile.accepting && <p className="notice">{profile.suspended ? "This workspace is paused by BridgeWay. Card taps show a closed form until it is reactivated." : !profile.acceptReferrals ? "Referral intake is turned off in the business profile in Settings." : "Referral intake opens once the subscription is active. Use Subscribe in the Billing section."}</p>}
      {activeSection === "inbox" && <section className="inbox-section" id="inbox" aria-labelledby="inbox-title">
        <div className="staff-inbox-header">
          <div>
            <h2 id="inbox-title">Referral inbox</h2>
            <p>{due ? "Earliest deadline first." : "Newest first."}</p>
          </div>
          <button className="staff-inbox-text-button" type="button" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh inbox"}
          </button>
        </div>
        <div className="staff-inbox-views" role="group" aria-label="Filter by read status">
          {(["All", "Unread", "Read"] as const).map(view => (
            <button key={view} type="button" className="staff-inbox-text-button" aria-pressed={readView === view}
              aria-controls="referrals" onClick={() => setReadView(view)}>{view}</button>
          ))}
        </div>
        <div className="staff-inbox-controls">
          <label className="staff-inbox-search" htmlFor="inbox-search">
            Search
            <input id="inbox-search" type="search" value={query} onChange={e => setQuery(e.target.value)}
              maxLength={120} placeholder="Name, email, phone or partner" />
          </label>
          <details className="staff-inbox-filters">
            <summary>Filters</summary>
            <div className="followup-toolbar">
              <label htmlFor="due-filter">Follow-up (Mountain Time)
                <select id="due-filter" value={due} onChange={e => setDue(e.target.value)}>
                  <option value="">Any deadline</option><option value="overdue">Overdue</option>
                  <option value="today">Due today</option><option value="upcoming">Upcoming</option>
                </select>
              </label>
              <label htmlFor="partner-filter">Partner
                <select id="partner-filter" value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}>
                  <option value="">All partners</option>
                  {partners.map(partner => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                </select>
              </label>
              <label htmlFor="received-from">Received from (UTC)<input id="received-from" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
              <label htmlFor="received-to">Received to (UTC)<input id="received-to" type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
              <label className="check"><input type="checkbox" checked={unresolvedOnly} onChange={e => setUnresolvedOnly(e.target.checked)} />Unresolved only</label>
              <label className="check"><input type="checkbox" checked={attentionOnly} onChange={e => setAttentionOnly(e.target.checked)} />Needs attention only</label>
            </div>
          </details>
          {hasFilters && <button type="button" className="staff-inbox-text-button" onClick={clearFilters}>Clear filters</button>}
        </div>
        <div className="referrals staff-referrals" id="referrals" aria-busy={refreshing}>
          {!filtered.length && !error && <p className="empty" role="status">{
            session === "loading" || refreshing ? "Loading referrals…" :
            nextCursor ? "No matching referrals on the loaded pages." :
            hasFilters ? "No referrals match these filters." :
            readView === "Unread" ? "You're caught up. No unread referrals." :
            readView === "Read" ? "No read referrals yet." : "No incoming referrals yet."
          }</p>}
          {!!filtered.length && <div className="staff-referral-table-wrap"><table className="staff-referral-table"><thead><tr><th scope="col">Referral</th><th scope="col">Referring partner</th><th scope="col">Receiving location</th><th scope="col">Assigned staff</th><th scope="col">Status</th><th scope="col">Next action</th></tr></thead><tbody>{filtered.map(r => {
            const isOverdue = overdueReferral(r);
            const needsFollowup = !["Completed", "Won", "Closed"].includes(r.status) && (r.status === "New" || !r.ownerId || isOverdue);
            const nextAction = ["Completed", "Won", "Closed"].includes(r.status) ? r.status : r.nextAction || (r.status === "New" ? "Contact within one business day" : r.status === "Contacted" ? "Agree on a next step" : r.status === "Scheduled" ? "Confirm the next step" : r.status);
            const displayName = r.firstName || r.lastName ? [r.firstName, r.lastName].filter(Boolean).join(" ") : r.name;
            const receivingLocation = cards.find(card => card.id === (r.cardId || r.doctorCode))?.officeName || r.doctorName || "Direct request";
            return <Fragment key={r.id}>
              <tr className="staff-referral-primary-row"><th scope="row"><h3 className="staff-referral-name">{displayName}</h3>{!readIds.has(r.id) && <span className="staff-inbox-unread">Unread</span>}{needsFollowup && <span className={`staff-badge${isOverdue ? " is-overdue" : ""}`}>{isOverdue ? "Overdue" : r.status === "New" ? "New" : "Unassigned"}</span>}<small className="staff-referral-meta">{new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" })}{r.ownerName ? ` · ${r.ownerName}` : ""}</small><button className="staff-inline-detail-toggle" aria-expanded={detailId === r.id} onClick={() => void showHistory(r.id)}>Contact &amp; history</button></th><td data-label="Partner">{r.partnerName || "Direct request"}</td><td data-label="Location">{receivingLocation}</td><td data-label="Assigned staff"><label className="sr-only" htmlFor={`queue-owner-${r.id}`}>Assigned staff for {displayName}</label><select id={`queue-owner-${r.id}`} value={r.ownerId || ""} disabled={!!busy || refreshing} onChange={e => void assign(r, members.find(m => m.id === e.target.value))}><option value="">Unassigned</option>{r.ownerId && !members.some(m => m.id === r.ownerId) && <option value={r.ownerId}>{r.ownerName || "Former staff member"}</option>}{members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></td><td data-label="Status"><label className="sr-only" htmlFor={`status-${r.id}`}>Status for {displayName}</label><select id={`status-${r.id}`} className="staff-referral-status" value={r.status} disabled={!!busy || refreshing} onChange={e => void changeStatus(r, e.target.value)}>{!allowedStatuses.some(status => status === r.status) && <option disabled>{r.status}</option>}{allowedStatuses.map(s => <option key={s}>{s}</option>)}</select></td><td data-label="Next action"><div>{nextAction}{r.nextActionAt && <small className="staff-referral-meta"><time dateTime={r.nextActionAt}>{new Date(r.nextActionAt).toLocaleString("en-US", { timeZone: "America/Denver", timeZoneName: "short" })}</time></small>}</div></td></tr>
              {detailId === r.id && <tr className="staff-referral-detail-row"><td colSpan={6}><dialog aria-labelledby="referral-detail-title" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={() => setDetailId("")} style={{ position: "fixed", inset: "0 0 0 auto", margin: 0, width: "min(100%, 32rem)", maxHeight: "100dvh", height: "100dvh", padding: "1.5rem", overflowY: "auto" }} className="card referral-detail-panel"><button autoFocus className="secondary" type="button" onClick={() => setDetailId("")}>Close details</button><h2 id="referral-detail-title">{displayName}</h2><div className="staff-referral-details"><div className="staff-referral-contact"><a href={"mailto:" + encodeURIComponent(r.email)}>{r.email}</a><a href={"tel:" + r.phone.replace(/[^+\d]/g, "")}>{r.phone}</a><span>Received {new Date(r.createdAt).toLocaleString("en-US", { timeZone: "America/Denver" })} MT</span>{r.serviceType && <span>{r.serviceType}</span>}{r.postalCode && <span>{r.postalCode}</span>}</div><div className="staff-referral-actions">{needsFollowup && <span className="referral-priority">{isOverdue ? "Overdue" : r.status === "New" ? "New request" : "Unassigned"}</span>}<span className="next-action">Next: {nextAction}</span><label htmlFor={`detail-status-${r.id}`}>Status<select id={`detail-status-${r.id}`} value={r.status} disabled={!!busy || refreshing} onChange={e => void changeStatus(r, e.target.value)}>{!allowedStatuses.some(status => status === r.status) && <option disabled>{r.status}</option>}{allowedStatuses.map(s => <option key={s}>{s}</option>)}</select></label><label htmlFor={`owner-${r.id}`}>Owner<select id={`owner-${r.id}`} value={r.ownerId || ""} disabled={!!busy || refreshing} onChange={e => void assign(r, members.find(m => m.id === e.target.value))}><option value="">Unassigned</option>{r.ownerId && !members.some(m => m.id === r.ownerId) && <option value={r.ownerId}>{r.ownerName || "Former staff member"}</option>}{members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label></div></div>
                {r.notes && <p className="notes staff-referral-notes">{r.notes}</p>}
                {detailId === r.id && <div className="referral-history"><FollowUpEditor key={r.id + r.etag} referral={r} onSaved={refresh} />{r.nextActionAt && <p>Follow-up due: {new Date(r.nextActionAt).toLocaleString("en-US", { timeZone: "America/Denver", timeZoneName: "short" })}</p>}{isAdmin && <button className="secondary" disabled={!alerts?.enabled || busy === "notify"} onClick={() => void notifyReferral(r.id)}>Queue missing staff notification</button>}<h3>Referral history</h3>{historyError ? <div role="alert"><p>{historyError}</p><button className="secondary" onClick={() => void loadHistory(r.id)}>Retry history</button></div> : !history[r.id] ? <p role="status">Loading history…</p> : history[r.id].length ? <ol>{history[r.id].map((item, index) => <li key={index}>{item.kind === "assignment" ? item.unassigned ? "Unassigned" : item.ownerName ? `Assigned to ${item.ownerName}` : "Staff assignment changed" : item.status} · {new Date(item.changedAt).toLocaleString("en-US", { timeZone: "America/Denver" })} MT · {item.actor}</li>)}</ol> : <p>No referral activity yet.</p>}</div>}
              </dialog></td></tr>}
            </Fragment>;
          })}</tbody></table></div>}
        </div>        {nextCursor && <div className="pagination"><button className="secondary" disabled={refreshing || busy === "more"} onClick={() => void loadMore()}>{busy === "more" ? "Loading…" : "Load more referrals"}</button></div>}
      </section>}
      {activeSection === "office-report" && isAdmin && <><button className="secondary" type="button" aria-label="Refresh analytics" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh analytics"}</button><OfficeReport report={selectedReport} availableMonths={report?.availableMonths} month={month} onMonth={selectMonth}/></>}
      {(activeSection === "management" || activeSection === "cards") && <section className="card doctors"><p className="eyebrow">REFERRAL NETWORK</p><h2>{activeSection === "cards" ? "Cards" : "Partners and locations"}</h2><p className="muted">Copy the referral URL and write it to the NFC card as a web link. Tap the physical card and scan the QR code to verify the business shown on the form.</p>
        {activeSection === "management" && isAdmin && <><form className="inline" onSubmit={createPartner}><label htmlFor="partner-name">Add partner<input id="partner-name" name="name" maxLength={120} required placeholder="Builder or referring office"/></label><button className="secondary" disabled={busy === "partner"}>Add partner</button></form><div className="form-grid"><form className="inline" onSubmit={createOffice}><label htmlFor="office-name">Add location<input id="office-name" name="name" maxLength={120} required placeholder="Office name"/></label><button className="secondary" disabled={busy === "office"}>Add location</button></form></div></>}
{activeSection === "cards" && <div className="partner-card-list">{cards.map(card => <article className="card-row" key={card.id}><div><strong>{card.partnerName} · {card.officeName}</strong><small>{card.active ? "Active" : "Inactive"} · {card.url}</small></div><div className="card-row-actions"><button className="secondary" onClick={() => void navigator.clipboard.writeText(card.url).then(() => setNotice("Referral link copied.")).catch(() => setError("Copy unavailable. Select the link to copy it manually."))}>Copy link</button>{card.active ? <button className="secondary" disabled={busy === "patient-preview"} onClick={() => void openPatientPreview(card)}>Preview Patient Form</button> : <small>Activate this card to preview the form.</small>}<button className="secondary" onClick={() => void makeQr(card)}>Show QR code</button></div>{qrCard?.id === card.id && <div className="qr-download"><img src={qrCard.data} alt={`QR code for ${card.partnerName}`}/><a href={qrCard.data} download={`bridgewayrefer-${card.id}.png`}>Download QR PNG</a></div>}</article>)}</div>}
{activeSection === "management" && <div className="partner-card-list"><p className="eyebrow">PARTNERS</p>{partners.map(p => <div className="card-row" key={p.id}><strong>{p.name}</strong><small>{p.active ? "Active" : "Inactive"}</small></div>)}</div>}
{activeSection === "management" && <div className="partner-card-list"><p className="eyebrow">LOCATIONS</p>{offices.map(o => <div className="card-row" key={o.id}><strong>{o.name}</strong><small>{o.active ? "Active" : "Inactive"}</small>
          {isAdmin && (editingOffice === o.id ? <form className="inline" onSubmit={event => void saveOfficeLogo(event, o)}>
            <label htmlFor={`logo-${o.id}`}>Logo URL<input id={`logo-${o.id}`} name="logoUrl" maxLength={500} defaultValue={o.logoUrl} placeholder="https://?" autoFocus /></label>
            <button className="secondary" disabled={busy === "office-logo"}>Save logo</button>
            <button className="secondary" type="button" onClick={() => setEditingOffice("")}>Cancel</button>
          </form> : <button className="secondary" onClick={() => setEditingOffice(o.id)}>Edit office</button>)}
        </div>)}</div>}
      </section>}

        {activeSection === "settings" && isAdmin && profile && <section className="card"><p className="eyebrow">PUBLIC INTAKE</p><h2>Business profile</h2><form className="form-grid" onSubmit={saveProfile}><label htmlFor="profile-name">Business name<input id="profile-name" name="name" maxLength={120} defaultValue={profile.name} required/></label><label className="span-two" htmlFor="profile-welcome">Form welcome<input id="profile-welcome" name="welcomeText" maxLength={500} defaultValue={profile.welcomeText}/></label><label htmlFor="profile-phone">Business phone<input id="profile-phone" name="phone" maxLength={40} defaultValue={profile.phone}/></label><label htmlFor="profile-logo">Logo URL<input id="profile-logo" name="logoUrl" maxLength={500} defaultValue={profile.logoUrl} placeholder="https://…"/></label><label className="span-two" htmlFor="profile-alert">New-referral alert email<input id="profile-alert" name="alertEmail" type="email" maxLength={254} defaultValue={profile.alertEmail} placeholder="frontdesk@yourbusiness.com"/></label><label className="check span-two"><input type="checkbox" name="acceptReferrals" defaultChecked={profile.acceptReferrals}/><span>Accept referral requests from our cards.</span></label><button className="primary span-two" disabled={busy === "profile"}>Save business profile</button></form></section>}
        {activeSection === "staff-access" && isAdmin && <section className="card" id="staff-access"><p className="eyebrow">INVITE-ONLY ACCESS</p><h2>Staff access</h2><form className="inline" onSubmit={inviteMember}><label htmlFor="invite-email">Invite email<input id="invite-email" name="email" type="email" maxLength={254} required placeholder="teammate@business.com"/></label><label htmlFor="invite-role">Role<select id="invite-role" name="role"><option>Staff</option><option>Admin</option></select></label><button className="secondary" disabled={busy === "invite"}>Create invite</button></form>{inviteLink && <p className="invite-link">Invite URL <a href={inviteLink}>{inviteLink}</a><button className="secondary" onClick={() => void navigator.clipboard.writeText(inviteLink)}>Copy</button></p>}<div className="partner-card-list">{members.map(m => <div className="card-row" key={m.id}><div><strong>{m.name}</strong><small>{m.email} · {m.role}</small></div><button className="secondary" disabled={busy === "member-" + m.id} onClick={() => void revokeMember(m)}>Revoke access</button></div>)}{invitations.filter(i => i.state === "Pending").map(i => <div className="card-row" key={i.id}><div><strong>{i.email}</strong><small>Invite pending · {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}</small></div><button className="secondary" disabled={busy === "invite-" + i.id} onClick={() => void cancelInvitation(i)}>Cancel invite</button></div>)}</div></section>}
        {activeSection === "billing" && isAdmin && <section className="card" id="billing"><p className="eyebrow">BUSINESS SUBSCRIPTION</p><h2>Billing</h2><div className="billing-price"><strong>${billing?.amountUsd ?? 50}</strong><span>{billing?.plan === "managed-calling" ? "Managed Calling, total per business / month" : "Workspace / business / month"}</span></div>{billing && !["active", "trialing", "past_due"].includes(billing.status) && <label className="billing-plan-select">Plan for next subscription<select value={checkoutPlan} onChange={event => setCheckoutPlan(event.target.value as "workspace" | "managed-calling")}><option value="workspace">Workspace - $50/month</option><option value="managed-calling" disabled={!billing.managedCallingConfigured}>Managed Calling - $400/month{!billing.managedCallingConfigured ? " (not configured)" : ""}</option></select></label>}<p className="muted">Status: <b>{billing?.status || "Loading"}</b>{billing?.renewalAt ? ` · Renews ${new Date(billing.renewalAt).toLocaleDateString()}` : ""}{billing?.cancelAtPeriodEnd ? " · Cancels at period end" : ""}</p><div className="billing-actions"><button className="primary" disabled={!billing?.configured || billing?.billingExempt || busy === "billing" || ["active", "trialing", "past_due"].includes(billing?.status || "")} onClick={() => void subscribe()}>Subscribe</button><button className="secondary" disabled={!billing?.customerLinked || busy === "billing"} onClick={() => void manageBilling()}>Manage Billing</button></div>{billing?.billingExempt && <p className="hint">Billing is covered by BridgeWay for this workspace.</p>}{billing && !billing.configured && <p className="hint">Online billing is not available yet. Contact BridgeWay.</p>}{billing?.testMode && <p className="hint">Stripe test mode: no real charges.</p>}{billing?.status === "past_due" && <p className="notice">Your last payment failed. Update your card in Manage Billing to keep referrals flowing.</p>}</section>}
        {activeSection === "settings" &&         <section className="card email-settings"><p className="eyebrow">STAY INFORMED</p><h2>Email alerts</h2><p role="status">{alerts ? alerts.enabled ? `Sending to ${alerts.recipient}. ${alerts.waiting} waiting, ${alerts.retrying} retrying.` : "Add an alert email in the business profile to get notified of new referrals." : "Checking email settings…"}</p>{isAdmin && <button className="secondary" disabled={!alerts?.enabled || busy === "alert"} onClick={() => void testAlert()}>Send test alert ↗</button>}{alerts && alerts.smtpConfigured === false && <p className="notice">Email delivery is unavailable. Contact BridgeWay to complete delivery setup.</p>}{!!alerts?.failed && <div className="alert-failure" role="status"><p>{alerts.failed} alerts failed after repeated delivery attempts.</p>{isAdmin && alerts.failures?.map(alert => <p key={alert.id}>{alert.attempts} attempts <button className="secondary" disabled={busy === "retry"} onClick={() => void retryAlert(alert.id)}>Retry failed alert</button></p>)}</div>}{!!alerts?.stalled && <p role="status">{alerts.stalled} alerts are waiting for recovery after an interrupted attempt.</p>}<p className="hint">Alerts contain a dashboard link. Referral details stay in the dashboard. Email server acceptance does not confirm inbox delivery.</p></section>}

    </>}
    </div></div></main>;
}




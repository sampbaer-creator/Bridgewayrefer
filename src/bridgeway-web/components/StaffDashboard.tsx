"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { statuses, type Alerts, type Doctor, type Referral, type Report } from "../lib/types";
import OfficeReport from "./OfficeReport";

export default function StaffDashboard() {
  const [referrals, setReferrals] = useState<Referral[]>([]), [doctors, setDoctors] = useState<Doctor[]>([]), [report, setReport] = useState<Report | null>(null), [alerts, setAlerts] = useState<Alerts | null>(null);
  const [month, setMonth] = useState(""), [filter, setFilter] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [updated, setUpdated] = useState(""), [limited, setLimited] = useState(false);
  const [session, setSession] = useState<"loading" | "active" | "expired" | "denied">("loading"), [demo, setDemo] = useState(false), [busy, setBusy] = useState("");
  const generation = useRef(0), stopped = useRef(false), loading = useRef(false);
  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      stopped.current = true; generation.current++; setReferrals([]); setDoctors([]); setReport(null); setAlerts(null); setSession(e.status === 401 ? "expired" : "denied");
    } else setError(e instanceof Error ? e.message : "Service unavailable. Please try again.");
  }, []);
  const refresh = useCallback(async () => {
    if (stopped.current || loading.current) return;
    loading.current = true; const request = ++generation.current;
    try {
      const auth = await api<{ demo: boolean }>("/api/staff/session");
      const [inbox, offices, analytics, email] = await Promise.all([
        api<{ referrals: Referral[]; limited: boolean }>("/api/staff/referrals"), api<{ doctors: Doctor[] }>("/api/staff/doctors"),
        api<Report>("/api/staff/analytics" + (month ? "?month=" + month : "")), api<Alerts>("/api/staff/alerts"),
      ]);
      if (request !== generation.current || stopped.current) return;
      setDemo(auth.demo); setSession("active"); setReferrals(inbox.referrals); setLimited(inbox.limited); setDoctors(offices.doctors); setReport(analytics); setAlerts(email); setUpdated(new Date().toLocaleTimeString()); setError("");
    } catch (e) { if (request === generation.current) handleError(e); }
    finally { loading.current = false; }
  }, [month, handleError]);
  useEffect(() => {
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(visibleRefresh, 60000);
    document.addEventListener("visibilitychange", visibleRefresh); window.addEventListener("focus", visibleRefresh); window.addEventListener("pageshow", visibleRefresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibleRefresh); window.removeEventListener("focus", visibleRefresh); window.removeEventListener("pageshow", visibleRefresh); };
  }, [refresh]);
  async function changeStatus(referral: Referral, status: string) {
    setBusy(referral.id); setError("");
    try { await api("/api/staff/referrals/" + referral.id, { method: "PATCH", body: JSON.stringify({ status, etag: referral.etag }) }); await refresh(); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function createDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setBusy("doctor"); setError(""); setNotice("");
    try { await api("/api/staff/doctors", { method: "POST", body: JSON.stringify({ name: new FormData(form).get("name") }) }); form.reset(); await refresh(); setNotice("Referral link created."); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function toggle(doctor: Doctor) {
    setBusy(doctor.id); setError("");
    try { await api("/api/staff/doctors/" + doctor.id, { method: "PATCH", body: JSON.stringify({ active: !doctor.active, etag: doctor.etag }) }); await refresh(); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  async function testAlert() {
    setBusy("alert"); setNotice("");
    try { await api("/api/staff/alerts/test", { method: "POST", body: "{}" }); setNotice("Test alert queued. Check the configured inbox shortly."); }
    catch (e) { handleError(e); } finally { setBusy(""); }
  }
  if (session === "expired" || session === "denied") return <main className="dashboard" id="main-content"><section className="card session-expired" role="alert"><h1>{session === "expired" ? "Please sign in again" : "Access denied"}</h1><p>{session === "expired" ? "Your staff session has ended. Saved referrals are safe. Sign in to continue." : "Your account does not have access to this office. Contact your administrator."}</p><a className="session-sign-in" href="/staff/login">Sign in to the office dashboard</a></section></main>;
  const filtered = referrals.filter(r => !filter || r.status === filter);
  return <>{demo && <div className="demo">DEMO · Fictional information only · Local staff preview</div>}<main className="dashboard" id="main-content" aria-busy={session === "loading"}>
    <div className="dashboard-heading"><div><p className="eyebrow">YOUR REFERRAL NETWORK</p><h1>Every introduction counts.</h1><p className="muted">Monthly office referrals and patient follow-up, all in one place.</p></div><nav className="section-nav" aria-label="Dashboard sections"><a href="#office-report">Overview</a><a href="#inbox">Inbox</a><a href="#offices">Office links</a></nav></div>
    <p className="error-message" role="alert">{error}</p><p className="hint" role="status">{notice}</p>
    <OfficeReport report={report} month={month} onMonth={setMonth} />
    <section className="inbox-section" id="inbox" aria-labelledby="inbox-title"><div className="section-heading"><div><p className="eyebrow">PATIENT FOLLOW-UP</p><h2 id="inbox-title">Referral inbox</h2><p className="muted">All dates · Track the next step for each patient.</p></div><button className="secondary" onClick={() => void refresh()}>Refresh inbox ↻</button></div>
      <div className="metrics" role="group" aria-label="Filter referrals by status">{["", ...statuses].map(status => <button key={status} className="metric" aria-pressed={filter === status} aria-controls="referrals" onClick={() => setFilter(status)}>{status || "All referrals"}<b>{status ? referrals.filter(r => r.status === status).length : referrals.length}</b></button>)}</div>
      <div className="toolbar"><span id="inbox-view" role="status">{filter || "All referrals"} · {filtered.length} shown</span><span>{updated && "Updated " + updated}</span></div>
      {limited && <p className="notice">Showing the newest 500 referrals. Monthly reporting includes all retained records.</p>}
      <div className="referrals" id="referrals">{!filtered.length && <p className="empty">{session === "loading" ? "Loading referrals…" : "No referrals in this view yet."}</p>}{filtered.map(r => <article className="referral" key={r.id}><div className="title-row"><h2>{r.name}</h2><label>Status<select className="status" aria-label={`Status for ${r.name}`} value={r.status} disabled={busy === r.id} onChange={e => void changeStatus(r, e.target.value)}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label></div><p className="muted">{r.doctorName} · {new Date(r.createdAt).toLocaleString("en-US", { timeZone: "America/Denver" })} MT</p><div className="details"><a href={"mailto:" + encodeURIComponent(r.email)}>{r.email}</a><a href={"tel:" + r.phone.replace(/[^+\d]/g, "")}>{r.phone}</a></div>{r.notes && <p className="notes">{r.notes}</p>}</article>)}</div>
    </section>
    <div className="management-grid"><section className="card doctors" id="offices"><p className="eyebrow">REFERRING PARTNERS</p><h2>Office cards &amp; links</h2><p className="muted">Create one link for each referring office. Use the same link for its NFC card and QR code.</p>
      <form className="inline" onSubmit={createDoctor}><label htmlFor="doctor-name">Referring office name<input id="doctor-name" name="name" maxLength={120} required placeholder="Example Dental" /></label><button className="primary" disabled={busy === "doctor"}>Create referral link ↗</button></form>
      <div>{doctors.map(d => <article className="doctor-row" key={d.id}><div><strong>{d.name}</strong><span className={d.active ? "badge" : "badge inactive"}>{d.active ? "Active" : "Inactive"}</span><a className="card-url" href={"/r/" + d.id} target="_blank" rel="noreferrer">{d.url}</a></div><div className="doctor-actions"><button className="secondary" onClick={() => void navigator.clipboard.writeText(d.url).then(() => setNotice("Referral link copied.")).catch(() => setError("Copy unavailable. Select the link to copy it manually."))}>Copy link</button><button className="secondary" disabled={busy === d.id} onClick={() => void toggle(d)}>{d.active ? "Deactivate" : "Reactivate"}</button></div></article>)}</div>
    </section><section className="card email-settings"><p className="eyebrow">STAY INFORMED</p><h2>Email alerts</h2><p role="status">{alerts ? alerts.enabled ? `Configured for ${alerts.recipient}. ${alerts.waiting} waiting, ${alerts.retrying} retrying.` : "Email alerts are not configured yet." : "Checking email settings…"}</p><button className="secondary" disabled={!alerts?.enabled || busy === "alert"} onClick={() => void testAlert()}>Send test alert ↗</button><p className="hint">Alerts contain a dashboard link. Patient details stay in the dashboard.</p></section></div>
  </main></>;
}

"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import MailboxSettings from "./MailboxSettings";
import { api } from "../lib/api";

type Customer = { testMode?: boolean; businessId: string; name: string; ownerEmail: string; ownerName?: string; notes?: string; plan: string; status: string; billingStatus?: string; createdAt: string; linkExpiresAt?: string; ownerSignedIn: boolean; lastEmail?: string; canIssueLink: boolean };
type Config = { testMode?: boolean; stripeIssue?: string | null; stripe: boolean; managedCalling: boolean; email: boolean; identity: boolean };
type Issued = { businessId: string; link: string; email: string };

const planLabels: Record<string, string> = { workspace: "Referral Workspace", "managed-calling": "Managed Calling", corporate: "Corporate/Custom" };
const emailLabels: Record<string, string> = {
  sent: "Email sent to the owner.",
  failed: "Email delivery failed. Copy the link and send it yourself.",
  not_configured: "Email is not configured (SMTP), so nothing was sent. Copy the link and send it yourself.",
  skipped: "No email sent. Copy the link and send it yourself.",
};

export default function AdminOnboarding() {
  const [customers, setCustomers] = useState<Customer[] | null>(null), [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(""), [issued, setIssued] = useState<Issued | null>(null), [copied, setCopied] = useState(false);
  const [plan, setPlan] = useState("workspace"), [sendEmail, setSendEmail] = useState(true);

  const load = useCallback(async () => {
    try { const result = await api<{ customers: Customer[]; config: Config }>("/api/admin/onboarding"); setCustomers(result.customers); setConfig(result.config); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load customers."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy("create"); setError(""); setIssued(null); setCopied(false);
    try {
      const result = await api<{ businessId: string; link: string | null; email: string }>("/api/admin/onboarding", { method: "POST", body: JSON.stringify({
        name: data.get("name"), ownerName: data.get("ownerName"), ownerEmail: data.get("ownerEmail"), notes: data.get("notes") || null, alertEmail: data.get("alertEmail") || null, industry: data.get("industry"), specialty: data.get("specialty"), plan, sendEmail: plan !== "corporate" && sendEmail,
      }) });
      if (result.link) setIssued({ businessId: result.businessId, link: result.link, email: result.email });
      form.reset(); setPlan("workspace"); setSendEmail(true); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the customer."); }
    finally { setBusy(""); }
  }

  async function newLink(customer: Customer, sendEmail: boolean) {
    setBusy(customer.businessId); setError(""); setIssued(null); setCopied(false);
    try {
      const result = await api<Issued>(`/api/admin/onboarding/${encodeURIComponent(customer.businessId)}/link`, { method: "POST", body: JSON.stringify({ sendEmail }) });
      setIssued(result); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not issue a new link."); }
    finally { setBusy(""); }
  }

  const paidReady = config?.stripe && config.identity && (plan !== "managed-calling" || config.managedCalling);
  return <section className="card admin-customer-onboarding" id="admin-onboarding" aria-label="Customer onboarding">
    <div className="admin-directory-heading"><div><h2>Customer onboarding</h2><p className="muted">The standard way to add a customer: create the business, send the owner a payment and signup link, the owner signs in and confirms their details, and their dashboard opens once Stripe confirms payment.</p></div></div>
    {config && (!config.stripe || !config.identity || !config.email || !config.managedCalling) && <p className="notice">
      {config.stripeIssue === "test_key" && "Stripe is using a test key. Complete Stripe activation and configure live billing before sending payment invitations. "}
      {!config.stripe && config.stripeIssue !== "test_key" && "Stripe is not configured, so Workspace and Managed Calling links cannot be created. "}
      {config.stripe && !config.managedCalling && "Managed Calling has no Stripe Price configured. "}
      {!config.identity && "Owner sign-in is not configured. "}
      {!config.email && "Email (SMTP) is not configured: links will not be emailed, copy them instead."}
    </p>}

    {config?.testMode && <p className="notice" role="status"><strong>Stripe sandbox is enabled.</strong> Invitations and Checkout use test payments. No real money is collected. Use Stripe test card 4242 4242 4242 4242 with a future expiry and any three-digit CVC.</p>}
    <MailboxSettings />
    <form className="admin-onboarding-form" onSubmit={create} aria-label="Create customer">
      <h3>Create customer</h3>
      <div className="admin-onboarding-grid">
        <label>Business name<input name="name" required minLength={2} maxLength={120} autoComplete="off" /></label>
        <label>Owner name<input name="ownerName" required maxLength={120} autoComplete="off" /></label>
        <label>Owner email<input name="ownerEmail" type="email" required maxLength={254} autoComplete="off" /></label>
        <label>Industry<select name="industry" required defaultValue="healthcare"><option value="healthcare">Healthcare</option><option value="trades">Trades</option><option value="other">Other</option></select></label>
        <label>Specialty<input name="specialty" required maxLength={120} placeholder="e.g. Orthodontics" /></label>
        <label>Plan<select name="plan" value={plan} onChange={e => setPlan(e.target.value)}>
          <option value="workspace">Referral Workspace</option><option value="managed-calling">Managed Calling</option><option value="corporate">Corporate/Custom</option>
        </select></label>
        <label><span className="admin-field-label">Alert email <em>optional</em></span><input name="alertEmail" type="email" maxLength={254} placeholder="Defaults to owner email" /></label>
        <label className="admin-onboarding-wide"><span className="admin-field-label">Notes <em>optional, only you see these</em></span><textarea name="notes" maxLength={1000} rows={2} /></label>
      </div>
      <div className="admin-onboarding-submit">
        {plan === "corporate"
          ? <p className="hint">Corporate/Custom is handled by you directly. The business is saved for follow-up and no payment link is created.</p>
          : <label className="admin-onboarding-check"><input name="sendEmail" type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} /> Email the link to the owner</label>}
        <button className="admin-primary-action" disabled={busy === "create" || (plan !== "corporate" && !paidReady)}>{busy === "create" ? "Creating…" : plan === "corporate" ? "Save for follow-up" : sendEmail ? "Send payment and signup link" : "Create payment and signup link"}</button>
      </div>
    </form>

    {error && <p className="error-message" role="alert">{error}</p>}
    {issued && <div className="admin-onboarding-issued" role="status">
      <p><strong>Payment link ready.</strong> {emailLabels[issued.email] ?? ""} Any earlier link for this customer no longer works.</p>
      <div className="admin-onboarding-link"><input readOnly value={issued.link} aria-label="Payment link" onFocus={e => e.currentTarget.select()} />
        <button type="button" className="secondary" onClick={() => { void navigator.clipboard.writeText(issued.link); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button></div>
      <p className="hint">For security only a fingerprint of this link is stored. Copy it now; later use Resend or New link.</p>
    </div>}

    <div className="admin-table"><table className="office-table"><thead><tr><th>Business</th><th>Owner</th><th>Plan</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>
      {(customers ?? []).map(c => <tr key={c.businessId}>
        <td data-label="Business">{c.name}{c.notes && <small className="muted admin-onboarding-note" title={c.notes}>{c.notes}</small>}</td>
        <td data-label="Owner">{c.ownerName && <strong className="admin-onboarding-owner">{c.ownerName}</strong>}<small className="muted">{c.ownerEmail}{c.ownerSignedIn && " · signed in"}</small></td>
        <td data-label="Plan">{planLabels[c.plan] ?? c.plan}</td>
        <td data-label="Status"><span className="admin-status-pill" data-live={c.status === "Owner account connected"}>{c.status}</span>{c.testMode && <small className="muted"> Sandbox workspace</small>}{c.lastEmail && <small className="muted">Email: {c.lastEmail}</small>}{c.linkExpiresAt && c.canIssueLink && <small className="muted"> link expires {new Date(c.linkExpiresAt).toLocaleDateString()}</small>}</td>
        <td data-label="Created">{new Date(c.createdAt).toLocaleDateString()}</td>
        <td data-label="Actions">{c.plan === "corporate"
          ? <a className="secondary" href={`mailto:${c.ownerEmail}?subject=${encodeURIComponent("BridgeWay setup for " + c.name)}`}>Contact owner</a>
          : c.canIssueLink ? <span className="admin-onboarding-actions">
            <button type="button" className="secondary" disabled={busy === c.businessId} onClick={() => void newLink(c, true)}>Resend link</button>
            <button type="button" className="secondary" disabled={busy === c.businessId} onClick={() => void newLink(c, false)}>New link</button>
          </span> : <span className="muted">—</span>}</td>
      </tr>)}
      {customers && !customers.length && <tr><td colSpan={6}>No customers yet. Create the first one above.</td></tr>}
      {!customers && !error && <tr><td colSpan={6}>Loading customers…</td></tr>}
    </tbody></table></div>
  </section>;
}

"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type Mailbox = { required: boolean; connected: boolean; email: string };
export default function MailboxSettings() {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setMailbox(await api<Mailbox>("/api/admin/email")); }
    catch { setError("Could not check the sender connection. Try refreshing this page."); }
  }, []);
  useEffect(() => {
    void load();
    const outcome = new URLSearchParams(window.location.search).get("mailbox");
    if (outcome === "connected") setMessage("Microsoft mailbox connected. Send a test email to check it.");
    else if (outcome === "wrong-account") setError("That was a different mailbox. Connect the BridgeWay sender address shown below.");
    else if (outcome === "session") setError("Your admin session ended during setup. Sign in to the admin dashboard and connect again.");
    else if (outcome === "failed") setError("Microsoft could not connect the mailbox. Try again and approve permission to send mail.");
  }, [load]);
  async function test() {
    setBusy(true); setMessage(""); setError("");
    try { await api("/api/admin/email/test", { method: "POST", body: "{}" }); setMessage("Microsoft accepted the test email. Check the sender mailbox inbox and Sent Items to confirm delivery."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not send the test email."); }
    finally { setBusy(false); await load(); }
  }
  if (!mailbox?.required && !error) return null;
  return <section className="admin-onboarding-form" aria-label="Sender email connection">
    <h3>Sender email</h3>
    {mailbox?.required && <>
      <p><strong>{mailbox.email}</strong> - {mailbox.connected ? "Connected to Microsoft" : "Connection required"}</p>
      <p className="muted">Walkthrough replies and customer invitations come from this mailbox. Connect it using its own Microsoft login. Your Azure login is separate.</p>
      <div className="admin-onboarding-actions">
        <a className="secondary" href="/api/admin/email/connect">{mailbox.connected ? "Reconnect sender mailbox" : "Connect sender mailbox"}</a>
        {mailbox.connected && <button type="button" className="secondary" disabled={busy} onClick={() => void test()}>{busy ? "Sending test..." : "Send test email"}</button>}
      </div>
    </>}
    {error && <p className="error-message">{error}</p>}
    {message && <p aria-live="polite">{message}</p>}
  </section>;
}

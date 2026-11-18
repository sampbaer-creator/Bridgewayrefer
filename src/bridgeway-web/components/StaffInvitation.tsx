"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, WORKSPACE_KEY } from "../lib/api";

const INVITE_KEY = "bridgeway.staff-invite";

export default function StaffInvitation({ children }: { children: ReactNode }) {
  const [invite, setInvite] = useState<string | null>(null);
  const [state, setState] = useState<"checking" | "signed-in" | "signed-out" | "unavailable">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    const params = new URLSearchParams(fragment);
    if (params.has("invite")) {
      sessionStorage.setItem(INVITE_KEY, fragment);
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    const pending = sessionStorage.getItem(INVITE_KEY) || "";
    setInvite(pending);

    if (!pending) return;
    const controller = new AbortController();
    api("/api/staff/session", { signal: controller.signal }).then(
      () => setState("signed-in"),
      (e: unknown) => {
        if (!controller.signal.aborted) setState(e instanceof ApiError && e.status === 401 ? "signed-out" : "unavailable");
      },
    );
    return () => controller.abort();
  }, []);

  async function accept() {
    const params = new URLSearchParams(invite || "");
    setBusy(true);
    setError("");
    try {
      const { businessId } = await api<{ businessId: string }>("/api/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ workspace: params.get("workspace"), token: params.get("invite") }),
      });
      localStorage.setItem(WORKSPACE_KEY, businessId);
      sessionStorage.removeItem(INVITE_KEY);
      window.location.replace("/staff");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState("signed-out");
      else setError(e instanceof Error ? e.message : "Could not accept the invitation. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (invite === null) return null;
  if (!invite) return children;

  return (
    <main className="dashboard" id="main-content">
      <section className="card no-workspace">
        <img className="session-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={100} height={34} />
        <h1>Workspace invitation</h1>
        <p>Sign in with the email address that received this invitation.</p>
        {state === "checking" && <p role="status">Checking your session…</p>}
        {state === "signed-out" && <a className="session-sign-in" href="/sign-in">Sign in</a>}
        {state === "signed-in" && <button className="primary" disabled={busy} onClick={() => void accept()}>{busy ? "Accepting…" : "Accept invitation"}</button>}
        {state === "unavailable" && <p role="alert">Could not check your access. Refresh or sign in again.</p>}
        {(state === "unavailable" || error) && <p><a href="/sign-in">Use another account</a></p>}
        {error && <p role="alert">{error}</p>}
        <p><button className="secondary" disabled={busy} onClick={() => { sessionStorage.removeItem(INVITE_KEY); setInvite(""); }}>Dismiss invitation</button></p>
      </section>
    </main>
  );
}

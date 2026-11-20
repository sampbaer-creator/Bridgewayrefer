"use client";
import { useEffect, useId, useRef, useState } from "react";
import { initials, signOut, type Account } from "../lib/account";
import "./account-menu.css";
import type { Business } from "../lib/api";

type Props = {
  account: Account | null;
  area: "admin" | "staff";
  platformAdmin: boolean;
  role?: string;
  workspaces?: Business[];
  currentWorkspace?: string;
  onSwitchWorkspace?: (businessId: string) => void;
};

export default function AccountMenu({ account, area, platformAdmin, role, workspaces = [], currentWorkspace, onSwitchWorkspace }: Props) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, [open]);

  if (!account) return null;
  const label = account.name || account.email;
  const others = workspaces.filter(w => !(area === "staff" && w.businessId === currentWorkspace));

  return <div className="account-menu" ref={root} onBlur={event => { if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={button} type="button" className="account-menu-button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <span className="account-avatar" aria-hidden="true">{initials(account)}</span>
      <span className="account-menu-text">
        <strong>{label}</strong>
        <small>{area === "admin" ? "Platform admin" : role || "Signed in"}</small>
      </span>
      <span className="sr-only">, account menu</span>
      <svg className="account-menu-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
    <div className="account-menu-panel" id={panelId} hidden={!open}>
      <div className="account-menu-identity">
        <span className="account-avatar account-avatar-large" aria-hidden="true">{initials(account)}</span>
        <div>
          {account.name && <strong>{account.name}</strong>}
          <span>{account.email || "Email not shared by sign-in"}</span>
          <span className="account-provider">Signed in with {account.provider}</span>
        </div>
      </div>
      {(area === "staff" && role) && <p className="account-menu-role">Workspace role: <strong>{role}</strong></p>}
      {(others.length > 0 || platformAdmin || area === "admin") && <div className="account-menu-section" role="group" aria-label="Switch to">
        <p className="account-menu-heading">Switch to</p>
        {area === "staff" && platformAdmin && <a className="account-menu-item" href="/admin">Platform admin</a>}
        {area === "admin" && <a className="account-menu-item" href="/staff">Business dashboard</a>}
        {area === "staff" && others.map(w => <button key={w.businessId} type="button" className="account-menu-item" onClick={() => { setOpen(false); onSwitchWorkspace?.(w.businessId); }}>
          <span>{w.name}</span><small>{w.signupPending ? "Setup pending" : w.role}</small>
        </button>)}
      </div>}
      <div className="account-menu-section">
        <a className="account-menu-item" href="/contact">Help and support</a>
        <button type="button" className="account-menu-item account-menu-signout" disabled={signingOut} onClick={() => { setSigningOut(true); void signOut(); }}>{signingOut ? "Signing out…" : "Sign out"}</button>
      </div>
    </div>
  </div>;
}

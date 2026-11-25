import { WORKSPACE_KEY } from "./api";

export type Account = { email: string; name: string; provider: "Microsoft" | "Google" };

export function initials(account: Account) {
  const source = account.name.trim() || account.email.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase() || "?";
}

export async function signOut(destination: "/sign-in" | "/admin" = "/sign-in") {
  try { await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
  finally {
    localStorage.removeItem(WORKSPACE_KEY);
    window.location.assign(destination);
  }
}

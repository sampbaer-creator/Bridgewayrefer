import type { Referral } from "./api";

export type InboxMember = { id: string; name: string };
export type InboxFilters = { q: string; status: string; partner: string; owner: string; from: string; to: string; unresolved: boolean; attention: boolean };
export const emptyFilters: InboxFilters = { q: "", status: "", partner: "", owner: "", from: "", to: "", unresolved: false, attention: false };

/** Saved views across the top of the inbox. Each one is a preset over the same server filters. */
export type InboxView = "attention" | "mine" | "unassigned" | "all";
export const views: { id: InboxView; label: string; filters: Partial<InboxFilters> }[] = [
  { id: "attention", label: "Needs attention", filters: { attention: true, owner: "" } },
  { id: "mine", label: "Mine", filters: { attention: false, owner: "me" } },
  { id: "unassigned", label: "Unassigned", filters: { attention: false, owner: "unassigned" } },
  { id: "all", label: "All", filters: { attention: false, owner: "" } },
];
export function activeView(filters: InboxFilters): InboxView | null {
  if (filters.attention) return filters.owner ? null : "attention";
  if (filters.owner === "me") return "mine";
  if (filters.owner === "unassigned") return "unassigned";
  return filters.owner ? null : "all";
}
export function hasRefinements(filters: InboxFilters) {
  return Boolean(filters.q.trim() || filters.status || filters.partner || filters.from || filters.to || filters.unresolved || (filters.owner && filters.owner !== "me" && filters.owner !== "unassigned"));
}

export function filtersToParams(filters: InboxFilters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.partner) params.set("partner", filters.partner);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.unresolved) params.set("unresolved", "true");
  if (filters.attention) params.set("attention", "true");
  return params;
}

export const terminalStatuses = ["Completed", "Won", "Closed"];
export const isTerminal = (status: string) => terminalStatuses.includes(status);

export function displayName(r: Referral) {
  return r.firstName || r.lastName ? [r.firstName, r.lastName].filter(Boolean).join(" ") : r.name;
}

/** New referrals should be contacted within one business day; weekends do not count. */
export function contactBy(createdAt: string) {
  const due = new Date(createdAt);
  if (Number.isNaN(due.getTime())) return null;
  do { due.setUTCDate(due.getUTCDate() + 1); } while (due.getUTCDay() === 0 || due.getUTCDay() === 6);
  return due;
}

export type Urgency = { due: Date | null; label: string; state: "overdue" | "soon" | "new" | "unassigned" | "ok" | "done" };
const SOON_MS = 24 * 60 * 60 * 1000;
/** Mirrors the server's needs-attention rule, plus a "due soon" warning before a deadline passes. */
export function urgency(r: Referral, now = Date.now()): Urgency {
  if (isTerminal(r.status)) return { due: null, label: r.status, state: "done" };
  const due = r.nextActionAt ? new Date(r.nextActionAt) : r.status === "New" ? contactBy(r.createdAt) : null;
  const ms = due ? due.getTime() - now : Infinity;
  if (due && ms < 0) return { due, label: "Overdue", state: "overdue" };
  if (due && ms < SOON_MS) return { due, label: "Due soon", state: "soon" };
  if (r.status === "New") return { due, label: "New", state: "new" };
  if (!r.ownerId) return { due, label: "Unassigned", state: "unassigned" };
  return { due, label: "", state: "ok" };
}

export function nextStep(r: Referral) {
  if (isTerminal(r.status)) return r.status;
  return r.nextAction || (r.status === "New" ? "Make first contact" : r.status === "Contacted" ? "Agree on a next step" : r.status === "Scheduled" ? "Confirm the appointment" : "Follow up");
}

/** One time format everywhere: the workspace's timezone when known, with the zone shown. */
export function formatDateTime(value: string | Date, timeZone?: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" });
}
export function formatDate(value: string, timeZone?: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

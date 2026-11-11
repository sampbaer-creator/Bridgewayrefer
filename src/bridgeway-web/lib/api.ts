export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export const WORKSPACE_KEY = "bridgeway.workspace";
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const workspace = typeof window === "undefined" ? "" : window.localStorage.getItem(WORKSPACE_KEY) || "";
  const response = await fetch(path, { ...options, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...(workspace ? { "X-Bridgewayrefer-Business": workspace } : {}), ...options.headers } });
  if (response.status === 401 || response.redirected) throw new ApiError("Your staff session has ended. Please sign in again.", 401);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || `Could not complete the request (HTTP ${response.status}).`, response.status);
  return body as T;
}
export type PublicConfig = { officeName: string; partnerName?: string; welcomeText: string; accepting: boolean; businessName?: string; logoUrl?: string; phone?: string };
export const statuses = ["New", "Contacted", "Scheduled", "Completed", "Quoted", "Won", "Closed"] as const;
export type Referral = { id: string; name: string; firstName?: string; lastName?: string; email: string; phone: string; notes: string; doctorCode: string; doctorName: string; partnerId?: string; partnerName?: string; officeId?: string; cardId?: string; ownerId?: string; ownerName?: string; serviceType?: string; postalCode?: string; status: string; createdAt: string; updatedAt?: string; nextAction?: string; nextActionAt?: string | null; etag: string };
export type Doctor = { id: string; name: string; active: boolean; etag: string; url: string };
export type Partner = { id: string; name: string; active: boolean; etag?: string };
export type Business = { businessId: string; name: string; role: "Admin" | "Staff"; signupPending?: boolean };
export type Alerts = { enabled: boolean; recipient: string; waiting: number; retrying: number; smtpConfigured?: boolean; failed?: number; stalled?: number; oldestWaitingAt?: string; failures?: { id: string; attempts: number }[] };
export type ReferralHistory = { status: string; actor: string; changedAt: string };
export type Report = { month: string; monthLabel: string; availableMonths: string[]; total: number; linkOpens: number; referringOffices: number; previousTotal: number; invalidDates: number;
  hasSubmissions: boolean; outcomes: number; outcomeLabel: string;
  offices: { officeId: string; name: string; active: boolean; count: number; opens: number; outcomes: number; outcomeRate: number | null }[];
  trend: { month: string; total: number; opens: number; offices: Record<string, number>; officeOpens: Record<string, number> }[];
};


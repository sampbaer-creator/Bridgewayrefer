export const statuses = ["New", "Contacted", "Scheduled", "Completed", "Closed"] as const;
export type Referral = { id: string; name: string; email: string; phone: string; notes: string; doctorCode: string; doctorName: string; status: string; createdAt: string; etag: string };
export type Doctor = { id: string; name: string; active: boolean; etag: string; url: string };
export type Alerts = { enabled: boolean; recipient: string; waiting: number; retrying: number };
export type Report = { month: string; monthLabel: string; availableMonths: string[]; total: number; linkOpens: number; referringOffices: number; previousTotal: number; invalidDates: number;
  offices: { officeId: string; name: string; active: boolean; count: number; opens: number }[];
  trend: { month: string; total: number; opens: number; offices: Record<string, number>; officeOpens: Record<string, number> }[];
};

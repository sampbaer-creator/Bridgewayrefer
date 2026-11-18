import { expect, test } from "@playwright/test";

const member = { id: "member-me", name: "Sam Rivera", email: "sam@example.invalid", role: "Staff", etag: "m1" };
const colleague = { id: "member-2", name: "Alex Kim", email: "alex@example.invalid", role: "Staff", etag: "m2" };

function referral(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { id, name, email: `${id}@example.invalid`, phone: "8015550100", notes: "", doctorCode: "card-a", doctorName: "", partnerId: "partner-a", partnerName: "General Dentist", cardId: "card-a", status: "New", createdAt: "2026-11-02T12:00:00Z", etag: "v1", ...extra };
}

test("views, bulk assign with undo, and a retryable history drawer", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("bridgeway.workspace", "business-a"));
  const rows = [referral("ref-1", "Ava Patel"), referral("ref-2", "Liam Chen", { status: "Contacted" })];
  const patches: unknown[] = [];
  let historyCalls = 0;
  await page.route("**/api/staff/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname, method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path.endsWith("/session")) return json({ businessId: "business-a", role: "Staff", memberId: member.id, businesses: [{ businessId: "business-a", name: "Fictional Practice", role: "Staff" }] });
    if (path.endsWith("/referrals") && method === "GET") {
      const owner = url.searchParams.get("owner");
      const visible = rows.filter(r => !owner || (owner === "unassigned" ? !(r as { ownerId?: string }).ownerId : (r as { ownerId?: string }).ownerId === member.id));
      return json({ referrals: visible, limited: false, totals: { byStatus: { New: 1, Contacted: 1 }, needsAttention: 2 } });
    }
    if (/\/referrals\/[^/]+\/assignment$/.test(path) && method === "PATCH") {
      const body = route.request().postDataJSON() as { ownerId: string | null; etag: string };
      const id = path.split("/")[4]; const row = rows.find(r => r.id === id) as Record<string, unknown>;
      patches.push({ id, ...body });
      if (row.etag !== body.etag) return json({ error: "This record changed. Refresh and try again." }, 409);
      row.ownerId = body.ownerId; row.ownerName = body.ownerId ? member.name : undefined; row.etag = `v${Date.now()}`;
      return json({ ok: true });
    }
    if (path.endsWith("/history")) {
      historyCalls++;
      if (historyCalls === 1) return json({ error: "History temporarily unavailable" }, 503);
      return json({ history: [] });
    }
    if (path.endsWith("/members")) return json({ members: [member, colleague] });
    if (path.endsWith("/partners")) return json({ partners: [{ id: "partner-a", name: "General Dentist", active: true }] });
    if (path.endsWith("/offices")) return json({ offices: [] });
    if (path.endsWith("/cards")) return json({ cards: [{ id: "card-a", partnerId: "partner-a", partnerName: "General Dentist", officeId: "o", officeName: "Main office", active: true, etag: "c", url: "https://example.invalid/r/card-a" }] });
    if (path.endsWith("/business/profile")) return json({ name: "Fictional Practice", officeName: "Main", welcomeText: "", phone: "", logoUrl: "", acceptReferrals: true, accepting: true, suspended: false, alertEmail: "", billingStatus: "active", monthlyPriceUsd: 50, etag: "p" });
    if (path.endsWith("/billing")) return json({ amountUsd: 50, interval: "month", status: "active", billingExempt: false, cancelAtPeriodEnd: false, configured: true, testMode: false, customerLinked: true });
    if (path.endsWith("/alerts")) return json({ enabled: false, smtpConfigured: false, recipient: "", waiting: 0, retrying: 0 });
    if (path.endsWith("/analytics")) return json({ month: "2026-11", monthLabel: "November 2026", timezone: "America/Denver", availableMonths: ["2026-11"], trend: [], total: 0, outcomes: 0, linkOpens: 0, offices: [] });
    return json({});
  });

  await page.goto("/staff#inbox");
  await expect(page.getByRole("heading", { name: "Ava Patel" })).toBeVisible();

  // Views: "Unassigned" narrows the server query and the list.
  await page.getByRole("button", { name: /^Unassigned/ }).click();
  await expect(page.getByRole("button", { name: /^Unassigned/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Liam Chen" })).toBeVisible();

  // Bulk: select all, assign to me, then undo from the toast.
  await page.getByRole("button", { name: "All" }).click();
  await page.getByLabel("Select all loaded referrals").check();
  await expect(page.getByRole("region", { name: "Bulk actions" })).toContainText("2 selected");
  await page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Assign to me" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 referrals assigned to you." })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 changes undone." })).toBeVisible();
  expect(patches.length).toBe(4);
  expect(patches.slice(2).map(p => (p as { ownerId: unknown }).ownerId)).toEqual([null, null]);

  // Drawer: history failure shows a retry; closing returns focus to the row's button.
  await page.getByRole("button", { name: "Contact & history for Ava Patel" }).click();
  const drawer = page.getByRole("dialog", { name: "Ava Patel" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("alert")).toContainText("History temporarily unavailable");
  await drawer.getByRole("button", { name: "Retry history" }).click();
  await expect(drawer.getByText("No status changes yet.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Contact & history for Ava Patel" })).toBeFocused();
});

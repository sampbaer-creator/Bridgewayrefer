import { expect, test } from "@playwright/test";

test("workspace admin can verify a card with a separate synthetic referral", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("bridgeway.workspace", "orthodontics-stage-a"));
  let created = false;
  const synthetic = { id: "ref-test-00000000-0000-4000-8000-000000000001", name: "BridgeWay test referral", partnerId: "partner-a", partnerName: "General Dentist", officeId: "office-a", cardId: "card-code-a", status: "New", createdAt: "2026-11-11T12:00:00Z", isTest: true };
  await page.route("**/api/staff/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/session")) return route.fulfill({ json: { businessId: "orthodontics-stage-a", role: "Admin", businesses: [{ businessId: "orthodontics-stage-a", name: "Fictional Orthodontics", role: "Admin" }] } });
    if (url.pathname.endsWith("/test-referrals") && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body).toEqual({ cardCode: "card-code-a", submissionId: expect.stringMatching(/^[0-9a-f-]{36}$/i) });
      expect(body).not.toHaveProperty("isTest");
      created = true;
      return route.fulfill({ status: 201, json: { ok: true, idempotent: false, referralId: synthetic.id } });
    }
    if (url.pathname.endsWith("/test-referrals")) return route.fulfill({ json: { referrals: created ? [synthetic] : [], limited: false } });
    if (url.pathname.endsWith("/referrals")) return route.fulfill({ json: { referrals: [], limited: false } });
    if (url.pathname.endsWith("/partners")) return route.fulfill({ json: { partners: [{ id: "partner-a", name: "General Dentist", active: true }] } });
    if (url.pathname.endsWith("/offices")) return route.fulfill({ json: { offices: [{ id: "office-a", name: "Fictional Orthodontics", active: true }] } });
    if (url.pathname.endsWith("/cards")) return route.fulfill({ json: { cards: [{ id: "card-code-a", partnerId: "partner-a", partnerName: "General Dentist", officeId: "office-a", officeName: "Fictional Orthodontics", active: true, etag: "v1", url: "https://example.invalid/r/card-code-a" }] } });
    if (url.pathname.endsWith("/members")) return route.fulfill({ json: { members: [] } });
    if (url.pathname.endsWith("/business/profile")) return route.fulfill({ json: { name: "Fictional Orthodontics", officeName: "Fictional Orthodontics", welcomeText: "", phone: "", logoUrl: "", acceptReferrals: false, accepting: false, suspended: false, alertEmail: "", billingStatus: "active", monthlyPriceUsd: 50, etag: "v1" } });
    if (url.pathname.endsWith("/billing")) return route.fulfill({ json: { amountUsd: 50, interval: "month", status: "active", billingExempt: false, cancelAtPeriodEnd: false, configured: false, testMode: true, customerLinked: true } });
    if (url.pathname.endsWith("/invitations")) return route.fulfill({ json: { invitations: [] } });
    if (url.pathname.endsWith("/alerts")) return route.fulfill({ json: { enabled: false, smtpConfigured: false, recipient: "", waiting: 0, retrying: 0 } });
    if (url.pathname.endsWith("/analytics")) return route.fulfill({ json: { month: "2026-11", monthLabel: "November 2026", timezone: "America/Denver", availableMonths: ["2026-11"], days: [1], calendarDays: 30, isCurrentMonth: true, total: 0, outcomes: 0, outcomeLabel: "Completed requests this month", hasSubmissions: false, linkOpens: 0, referringOffices: 0, offices: [], invalidDates: 0, previousTotal: 0, trend: [] } });
    throw new Error(`Unexpected staff request: ${url.pathname}`);
  });
  await page.goto("/staff");
  await expect(page.getByText("No test referrals yet.")).toBeVisible();
  await page.getByRole("button", { name: "Run test referral" }).click();
  await expect(page.getByText("Synthetic test referral created for General Dentist", { exact: false })).toBeVisible();
  await expect(page.locator("#test-referrals").getByText("General Dentist")).toBeVisible();
  await expect(page.locator("#test-referrals").getByText("card-code-a")).toBeVisible();
  await expect(page.getByText("No requests match these filters.")).toBeVisible();
  await expect(page.getByText("It is excluded from the normal inbox, alerts, and reports.", { exact: false })).toBeVisible();
});

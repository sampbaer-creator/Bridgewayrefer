import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("bridgeway.workspace", "orthodontics-stage-a"));
  await page.route("**/api/staff/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/session")) return route.fulfill({ json: { businessId: "orthodontics-stage-a", role: "Admin", businesses: [{ businessId: "orthodontics-stage-a", name: "Fictional Orthodontics", role: "Admin" }] } });
    if (url.pathname.endsWith("/referrals")) return route.fulfill({ json: { referrals: [], limited: false } });
    if (url.pathname.endsWith("/partners")) return route.fulfill({ json: { partners: [{ id: "partner-a", name: "General Dentist", active: true }] } });
    if (url.pathname.endsWith("/offices")) return route.fulfill({ json: { offices: [{ id: "office-a", name: "Fictional Orthodontics", active: true, etag: "v1" }] } });
    if (url.pathname.endsWith("/offices/office-a")) {
      expect(route.request().method()).toBe("PATCH");
      expect(route.request().postDataJSON()).toEqual({ logoUrl: "/brand-mark.png", etag: "v1" });
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname.endsWith("/cards/card-code-a/preview")) {
      expect(route.request().headers()["x-bridgewayrefer-business"]).toBe("orthodontics-stage-a");
      return route.fulfill({ json: { officeName: "Fictional Orthodontics", businessName: "Fictional Group", officeLogoUrl: "/brand-logo.png", logoUrl: "/brand-mark.png", welcomeText: "Welcome", accepting: true } });
    }
    if (url.pathname.endsWith("/cards")) return route.fulfill({ json: { cards: [{ id: "card-code-a", partnerId: "partner-a", partnerName: "General Dentist", officeId: "office-a", officeName: "Fictional Orthodontics", active: true, etag: "v1", url: "https://example.invalid/r/card-code-a" }] } });
    if (url.pathname.endsWith("/members")) return route.fulfill({ json: { members: [] } });
    if (url.pathname.endsWith("/business/profile")) return route.fulfill({ json: { name: "Fictional Orthodontics", officeName: "Fictional Orthodontics", welcomeText: "", phone: "", logoUrl: "", acceptReferrals: false, accepting: false, suspended: false, alertEmail: "", billingStatus: "active", monthlyPriceUsd: 50, etag: "v1" } });
    if (url.pathname.endsWith("/billing")) return route.fulfill({ json: { amountUsd: 50, interval: "month", status: "active", billingExempt: false, cancelAtPeriodEnd: false, configured: false, testMode: true, customerLinked: true } });
    if (url.pathname.endsWith("/invitations")) return route.fulfill({ json: { invitations: [] } });
    if (url.pathname.endsWith("/alerts")) return route.fulfill({ json: { enabled: false, smtpConfigured: false, recipient: "", waiting: 0, retrying: 0 } });
    if (url.pathname.endsWith("/analytics")) return route.fulfill({ json: { month: "2026-11", monthLabel: "November 2026", timezone: "America/Denver", availableMonths: ["2026-11"], days: [1], calendarDays: 30, isCurrentMonth: true, total: 0, outcomes: 0, outcomeLabel: "Completed requests this month", hasSubmissions: false, linkOpens: 0, referringOffices: 0, offices: [], invalidDates: 0, previousTotal: 0, trend: [] } });
    throw new Error(`Unexpected staff request: ${url.pathname}`);
  });
});

test("retired workspace setup bookmarks open Overview", async ({ page }) => {
  await page.goto("/staff#workspace-setup");
  await expect(page).toHaveURL(/#overview$/);
  await expect(page.getByRole("link", { name: "Billing", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Setup", exact: true })).toHaveCount(0);
  await expect(page.locator("#workspace-setup")).toHaveCount(0);
  await page.getByRole("link", { name: "Referral inbox", exact: true }).click();
  await expect(page.getByText("No incoming referrals yet.")).toBeVisible();

});

test("read-only referral network and patient preview preserve submission and open counts", async ({ page }) => {
  const publicWrites: string[] = [];
  page.on("request", request => {
    if (["/api/link-opens", "/api/referrals"].includes(new URL(request.url()).pathname) && request.method() === "POST") publicWrites.push(request.url());
  });
  await page.route("**/missing-office-logo.png", route => route.fulfill({ status: 404 }));
  await page.goto("/staff#management");
  await expect(page.getByRole("link", { name: "Referral network" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit office" })).toHaveCount(0);
  await page.getByRole("button", { name: "Preview Patient Form" }).click();
  await expect(page.getByText("Submissions are disabled.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Fictional Group" })).toHaveAttribute("src", "/brand-mark.png");
  await expect(page.getByRole("button", { name: "Send my request" })).toBeDisabled();
  await page.getByRole("button", { name: "Back to referral network" }).click();
  await expect(page.getByRole("button", { name: "Preview Patient Form" })).toBeVisible();
  expect(publicWrites).toEqual([]);
});

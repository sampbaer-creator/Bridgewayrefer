import { test, expect, type Page, type Route } from "@playwright/test";
import type { Report } from "../lib/types";

const months = ["2026-11", "2026-10", "2026-09", "2026-08"];
function report(month: string): Report {
  const count = Number(month.slice(5));
  return { month, monthLabel: `${month} report`, availableMonths: months, total: count, linkOpens: count * 2,
    referringOffices: 1, previousTotal: count - 1, invalidDates: 0,
    offices: [{ officeId: "fictional", name: `${month} office`, active: true, count, opens: count * 2 }],
    trend: [{ month, total: count, opens: count * 2, offices: { fictional: count }, officeOpens: { fictional: count * 2 } }],
  };
}

async function dashboard(page: Page) {
  await page.addInitScript(() => { localStorage.setItem("bridgeway.workspace", "demo-business"); sessionStorage.setItem("bridgeway.testMonth", "2026-11"); });
  // Deliberately ignore analytics cancellation: late responses must also be rejected
  // by request ownership, even if a transport does not honor AbortSignal.
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (input, init) => String(input).startsWith("/api/staff/analytics")
      ? original(input, { ...init, signal: undefined }) : original(input, init);
  });
  const pending = new Map<string, Route[]>();
  await page.route("**/api/staff/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/analytics")) {
      const month = url.searchParams.get("month");
      if (month) { pending.set(month, [...pending.get(month) || [], route]); return; }
      await route.fulfill({ json: report("2026-11") });
    } else if (url.pathname.endsWith("/session")) await route.fulfill({ json: { demo: true, businessId: "demo-business", role: "Admin", businesses: [{ businessId: "demo-business", name: "Fictional Demo", preset: "dental", role: "Admin" }] } });
    else if (url.pathname.endsWith("/referrals")) await route.fulfill({ json: { referrals: [], limited: false } });
    else if (url.pathname.endsWith("/doctors")) await route.fulfill({ json: { doctors: [] } });
    else if (url.pathname.endsWith("/partners")) await route.fulfill({ json: { partners: [] } });
    else if (url.pathname.endsWith("/offices")) await route.fulfill({ json: { offices: [] } });
    else if (url.pathname.endsWith("/cards")) await route.fulfill({ json: { cards: [] } });
    else if (url.pathname.endsWith("/members")) await route.fulfill({ json: { members: [] } });
    else if (url.pathname.endsWith("/business/profile")) await route.fulfill({ json: { name: "Fictional Demo", officeName: "Fictional Demo", preset: "dental", welcomeText: "", phone: "", logoUrl: "", acceptReferrals: false, billingStatus: "not_configured", monthlyPriceUsd: 50, etag: "fictional" } });
    else if (url.pathname.endsWith("/billing")) await route.fulfill({ json: { amountUsd: 50, interval: "month", status: "not_configured", cancelAtPeriodEnd: false, configured: false, testMode: false, customerLinked: false } });
    else if (url.pathname.endsWith("/invitations")) await route.fulfill({ json: { invitations: [] } });
    else if (url.pathname.endsWith("/alerts")) await route.fulfill({ json: { enabled: false, recipient: "", waiting: 0, retrying: 0 } });
    else throw new Error(`Unexpected staff request: ${url.pathname}`);
  });
  await page.goto("/staff");
  const total = page.locator(".summary-primary strong");
  await expect(total).toHaveText("11");
  const waitForMonth = async (month: string, count = 1) => {
    await expect.poll(() => pending.get(month)?.length || 0).toBe(count);
  };
  const complete = async (month: string, status = 200, index = 0) => {
    const response = page.waitForResponse(r => new URL(r.url()).searchParams.get("month") === month);
    await pending.get(month)![index].fulfill({ status, json: status === 200 ? report(month) : { error: `${month} unavailable` } });
    await (await response).finished();
    // Let response parsing and React's scheduled update finish before asserting
    // that a superseded response did not alter either results or errors.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  };
  return { total, pending, waitForMonth, complete };
}

for (const order of ["old-first", "latest-first"] as const) {
  test(`rapid Previous month clicks use the latest selection (${order})`, async ({ page }) => {
    const { total, pending, waitForMonth, complete } = await dashboard(page);
    await page.getByRole("button", { name: "Previous month" }).click();
    await waitForMonth("2026-10");
    // Controls must remain usable while October is still loading.
    await page.getByRole("button", { name: "Previous month" }).click();
    await waitForMonth("2026-09");
    await expect(total).toHaveText("—");
    await expect(page.getByLabel("Reporting month")).toHaveValue("2026-09");
    if (order === "old-first") {
      await complete("2026-10");
      await expect(total).toHaveText("—");
      await page.getByRole("button", { name: "Refresh inbox" }).click();
      // An older request's finally must not release the newer request's lock.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      expect(pending.get("2026-09")).toHaveLength(1);
      await complete("2026-09");
    } else {
      await complete("2026-09");
      await expect(total).toHaveText("9");
      await complete("2026-10");
    }
    await expect(total).toHaveText("9");
    await expect(page.locator(".table-month, .table-heading")).toContainText("2026-09 report");
    await expect(page.locator(".office-bars")).toContainText("2026-09 office");
    await expect(page.locator("main .error-message")).toBeEmpty();
  });
}

test("rapid dropdown changes discard stale failures and keep refresh tied to the selected month", async ({ page }) => {
  const { total, waitForMonth, complete } = await dashboard(page);
  await page.getByLabel("Reporting month").selectOption("2026-10");
  await waitForMonth("2026-10");
  await page.getByLabel("Reporting month").selectOption("2026-09");
  await waitForMonth("2026-09");
  await page.getByLabel("Reporting month").selectOption("2026-08");
  await waitForMonth("2026-08");
  await complete("2026-08");
  await complete("2026-10", 503);
  await complete("2026-09");
  await expect(total).toHaveText("8");
  await expect(page.getByLabel("Reporting month")).toHaveValue("2026-08");
  await expect(page.locator("main .error-message")).toBeEmpty();
  await page.getByRole("button", { name: "Refresh inbox" }).click();
  await waitForMonth("2026-08", 2);
  await complete("2026-08", 200, 1);
  await expect(total).toHaveText("8");
});

test("latest-month failures stay visible until a successful retry, despite stale successes", async ({ page }) => {
  const { total, waitForMonth, complete } = await dashboard(page);
  await page.getByLabel("Reporting month").selectOption("2026-10");
  await waitForMonth("2026-10");
  await page.getByLabel("Reporting month").selectOption("2026-09");
  await waitForMonth("2026-09");
  await complete("2026-09", 503);
  await expect(page.locator("main .error-message")).toHaveText("2026-09 unavailable");
  await complete("2026-10");
  await expect(total).toHaveText("—");
  await expect(page.locator("main .error-message")).toHaveText("2026-09 unavailable");
  await page.getByRole("button", { name: "Refresh inbox" }).click();
  await waitForMonth("2026-09", 2);
  await complete("2026-09", 200, 1);
  await expect(total).toHaveText("9");
  await expect(page.locator("main .error-message")).toBeEmpty();
});

test("a current authorization failure clears the dashboard and late reports cannot restore it", async ({ page }) => {
  const { waitForMonth, complete } = await dashboard(page);
  await page.getByLabel("Reporting month").selectOption("2026-10");
  await waitForMonth("2026-10");
  await page.getByLabel("Reporting month").selectOption("2026-09");
  await waitForMonth("2026-09");
  await complete("2026-09", 401);
  await expect(page.getByRole("heading", { name: "Please sign in again" })).toBeVisible();
  await complete("2026-10");
  await expect(page.getByRole("heading", { name: "Please sign in again" })).toBeVisible();
  await expect(page.locator("#office-report")).toHaveCount(0);
});

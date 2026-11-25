import { expect, test } from "@playwright/test";
import { isOverdue } from "../lib/follow-up";
import type { Referral } from "../lib/api";

test("a scheduled referral only becomes overdue when its action deadline is missed", () => {
  const row = { status: "Scheduled", createdAt: "2020-01-01T00:00:00Z" } as Referral;
  expect(isOverdue(row)).toBe(false);
  expect(isOverdue({ ...row, nextActionAt: "2099-01-01T00:00:00Z" })).toBe(false);
  expect(isOverdue({ ...row, nextActionAt: "2020-01-01T00:00:00Z" })).toBe(true);
  expect(isOverdue({ ...row, status: "Completed", nextActionAt: "2020-01-01T00:00:00Z" })).toBe(false);
});

test("marketing routes expose metadata and private routes are excluded from indexing", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Referrals, followed through.");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Referral management.*NFC and QR links/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://bridgewayrefer.com");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const robots = await request.get("/robots.txt"); expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("sitemap.xml");
  const sitemap = await request.get("/sitemap.xml");
  const sitemapText = await sitemap.text();
  expect(sitemapText).not.toContain("/pricing"); expect(sitemapText).toContain("/industries/healthcare"); expect(sitemapText).toContain("/industries/trades");
  expect(sitemapText).toContain("/blog"); expect(sitemapText).toContain("/faq"); expect(sitemapText).not.toContain("/staff");
  await page.goto("/industries/dental");
  await expect(page).toHaveURL(/\/industries\/dental$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Dental referral software");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://bridgewayrefer.com/industries/dental");
  await page.goto("/referral-management-software");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("From tap to follow-up");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://bridgewayrefer.com/how-it-works");
  await page.goto("/referral-tracking-software");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("From tap to follow-up");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://bridgewayrefer.com/how-it-works");
  await page.goto("/industries/trades");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep the next job in sight");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://bridgewayrefer.com/industries/trades");
  await page.goto("/staff");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("The card may have been deactivated", { exact: false })).toHaveCount(0);
});

test("a walkthrough request needs no login and keeps its idempotency key after a retry", async ({ page }) => {
  const ids: string[] = [];
  await page.route("**/api/demo-requests", async route => {
    const body = route.request().postDataJSON(); ids.push(body.submissionId);
    expect(body).toMatchObject({ name: "Fictional User", businessName: "Fictional Practice", phone: "(801) 555-0100", consent: true });
    await route.fulfill(ids.length === 1 ? { status: 503, json: { error: "Please retry" } } : { status: 202, json: { ok: true } });
  });
  await page.goto("/contact");
  await page.getByLabel("Your name").fill("Fictional User");
  await page.getByLabel("Work email").fill("fictional@example.invalid");
  await page.getByLabel("Practice or business").fill("Fictional Practice");
  await page.getByLabel("Phone number").fill("(801) 555-0100");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Request a walkthrough" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Please retry");
  await page.getByRole("button", { name: "Request a walkthrough" }).click();
  await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
  expect(ids[0]).toBe(ids[1]);
});

test("server search and continuation pages retrieve historical referrals", async ({ page }, testInfo) => {
  const old = { id: "ref-old", name: "Historical Patient", email: "fictional@example.invalid", phone: "8015550100", status: "Scheduled", createdAt: "2020-01-01T00:00:00Z", etag: "v1" };
  let historyRequests = 0;
  await page.route("**/api/staff/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/session")) return route.fulfill({ json: { businessId: "business-a", role: "Staff", businesses: [{ businessId: "business-a", name: "Fictional Practice", role: "Staff" }] } });
    if (url.pathname.endsWith("/ref-old") && route.request().method() === "PATCH") {
      expect(route.request().postDataJSON()).toMatchObject({ status: "Contacted", etag: "v1" });
      old.status = "Contacted";
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname.endsWith("/referrals")) {
      if (url.searchParams.get("q") === "Historical") return route.fulfill({ json: { referrals: [old], limited: false } });
      if (url.searchParams.get("cursor")) { expect(url.searchParams.get("cursor")).toBe("page-two"); return route.fulfill({ json: { referrals: [old], limited: false } }); }
      return route.fulfill({ json: { referrals: [], limited: true, nextCursor: "page-two" } });
    }
    if (url.pathname.endsWith("/history")) {
      historyRequests++;
      return route.fulfill(historyRequests === 1
        ? { status: 503, json: { error: "History temporarily unavailable" } }
        : { json: { history: [{ kind: "assignment", ownerName: "Intake team", changedAt: old.createdAt, actor: "staff" }] } });
    }
    if (url.pathname.endsWith("/follow-up")) {
      expect(route.request().postDataJSON()).toMatchObject({ nextAction: "Call patient", etag: "v1" });
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { partners: [], offices: [], cards: [], members: [], name: "Fictional Practice", enabled: false, waiting: 0, retrying: 0 } });
  });
  await page.goto("/staff#inbox");
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".staff-inbox-filters > summary").click();
  const dueSearch = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/referrals") && url.searchParams.get("due") === "today";
  });
  await page.getByLabel("Follow-up (Mountain Time)").selectOption("today");
  await dueSearch;
  await expect(page.getByText("Earliest deadline first.")).toBeVisible();
  const clearedSearch = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/referrals") && !new URL(response.url()).search);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await clearedSearch;
  await page.getByRole("button", { name: "Load more referrals" }).click();
  await expect(page.getByRole("heading", { name: old.name })).toBeVisible();
  await expect(page.getByRole("table").getByText("Overdue", { exact: true })).toHaveCount(0);
  const searched = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/referrals") && new URL(response.url()).searchParams.get("q") === "Historical");
  await page.getByRole("searchbox", { name: "Search" }).fill("Historical");
  await searched;
  await expect(page.getByRole("heading", { name: old.name })).toBeVisible();
  await page.getByRole("button", { name: "Contact & history" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("History temporarily unavailable");
  await page.getByRole("button", { name: "Retry history" }).click();
  await expect(page.getByText("Assigned to Intake team", { exact: false })).toBeVisible();
  await expect(page.locator("#detail-status-ref-old")).toHaveValue("Scheduled");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("Historical");
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(page.getByRole("heading", { name: old.name })).toHaveCount(0);
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.getByRole("heading", { name: old.name })).toBeVisible();
  await page.getByRole("button", { name: "Contact & history" }).click();
  await page.locator("#detail-status-ref-old").selectOption("Contacted");
  await expect(page.locator("#detail-status-ref-old")).toHaveValue("Contacted");
  await expect.poll(() => historyRequests).toBe(4);
  await page.screenshot({ path: testInfo.outputPath("inbox-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("inbox-mobile.png") });
  await page.getByLabel("Next action", { exact: true }).fill("Call patient");
  await page.getByRole("button", { name: "Save follow-up" }).click();
});



test("a workspace invitation stays in the tab through sign-in and requires explicit acceptance", async ({ page }) => {
  const token = "a".repeat(64);
  let signedIn = false;
  let accepts = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/staff/session") return route.fulfill(signedIn
      ? { json: { businesses: [] } }
      : { status: 401, json: { error: "Please sign in." } });
    if (path === "/api/invitations/accept") {
      accepts++;
      expect(route.request().postDataJSON()).toEqual({ workspace: "business-a", token });
      return route.fulfill({ json: { businessId: "business-a" } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/staff#invite=" + token + "&workspace=business-a");
  await expect(page.getByRole("heading", { name: "Workspace invitation" })).toBeVisible();
  await expect(page).toHaveURL(/\/staff$/);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  signedIn = true;
  await page.goto("/staff");
  await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  expect(accepts).toBe(0);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("heading", { name: "Invitation required" })).toBeVisible();
  expect(accepts).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("bridgeway.staff-invite"))).toBeNull();
});

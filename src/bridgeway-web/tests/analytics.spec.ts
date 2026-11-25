import { test, expect, type Page } from "@playwright/test";

async function watch(page: Page) {
  const hits: string[] = [];
  await page.route(/googletagmanager\.com|google-analytics\.com/, route => { hits.push(route.request().url()); return route.fulfill({ contentType: "text/javascript", body: "" }); });
  await page.route("**/api/**", route => route.fulfill({ status: 401, json: { error: "signed out" } }));
  return hits;
}

test("no tags load on a marketing page until the visitor accepts", async ({ page }) => {
  const hits = await watch(page);
  await page.goto("/how-it-works");
  const banner = page.getByRole("region", { name: "Cookie choices" });
  await expect(banner).toBeVisible();
  expect(hits).toHaveLength(0);
  await banner.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(() => hits.filter(u => u.includes("gtm.js?id=GTM-TSJS8XCM")).length).toBe(1);
  expect(hits.some(u => u.includes("gtag/js"))).toBe(false);
  const consent = await page.evaluate(() => (window as unknown as { dataLayer: IArguments[] }).dataLayer.filter(e => e[0] === "consent").map(e => [e[1], e[2]]));
  expect(consent[0]).toEqual(["default", expect.objectContaining({ analytics_storage: "denied", ad_storage: "denied" })]);
  expect(consent[1]).toEqual(["update", { analytics_storage: "granted" }]);
});

test("declining keeps tags off and hides the banner on later visits", async ({ page }) => {
  const hits = await watch(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Decline" }).click();
  await page.goto("/industries/dental");
  await expect(page.getByRole("region", { name: "Cookie choices" })).toHaveCount(0);
  expect(hits).toHaveLength(0);
});

for (const path of ["/staff", "/admin", "/sign-in", "/signup", "/r/demo-code", "/privacy"]) {
  test(`sensitive or non-marketing page ${path} never loads tags even with consent`, async ({ page }) => {
    const hits = await watch(page);
    await page.addInitScript(() => localStorage.setItem("bridgeway.analytics-consent", "granted"));
    await page.goto(path);
    await page.waitForTimeout(1000);
    await expect(page.getByRole("region", { name: "Cookie choices" })).toHaveCount(0);
    expect(hits).toHaveLength(0);
  });
}

test("leaving a tracked page for sign-in is a full page load, dropping the tag manager", async ({ page }) => {
  const hits = await watch(page);
  await page.addInitScript(() => localStorage.setItem("bridgeway.analytics-consent", "granted"));
  await page.goto("/industries/trades");
  await expect.poll(() => hits.length).toBeGreaterThan(0);
  await page.evaluate(() => { (window as unknown as { marker: boolean }).marker = true; });
  await page.locator("a[href='/sign-in']").first().click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBeUndefined();
  expect(await page.evaluate(() => document.querySelectorAll("script[src*='googletagmanager']").length)).toBe(0);
});

test("cookie settings reopens the banner", async ({ page }) => {
  await watch(page);
  await page.addInitScript(() => localStorage.setItem("bridgeway.analytics-consent", "denied"));
  await page.goto("/contact");
  await page.getByRole("button", { name: "Cookie settings" }).click();
  await expect(page.getByRole("region", { name: "Cookie choices" })).toBeVisible();
});

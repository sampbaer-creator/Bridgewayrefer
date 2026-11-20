import { test, expect, type Page } from "@playwright/test";

const account = { name: "Fictional Owner", email: "owner@example.test", provider: "Microsoft" };

async function staff(page: Page, platformAdmin: boolean) {
  let logouts = 0;
  await page.addInitScript(() => localStorage.setItem("bridgeway.workspace", "biz-a"));
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/logout") { logouts++; return route.fulfill({ json: { ok: true } }); }
    if (path === "/api/staff/session") return route.fulfill({ json: { ok: true, account, platformAdmin, businessId: route.request().headers()["x-bridgewayrefer-business"] || "biz-a", role: "Admin",
      businesses: [{ businessId: "biz-a", name: "Fictional Lehi", role: "Admin" }, { businessId: "biz-b", name: "Fictional Provo", role: "Staff" }] } });
    if (path === "/api/staff/referrals") return route.fulfill({ json: { referrals: [], limited: false } });
    return route.fulfill({ json: { partners: [], offices: [], cards: [], members: [], invitations: [], name: "Fictional Lehi", enabled: false, waiting: 0, retrying: 0 } });
  });
  await page.goto("/staff");
  return () => logouts;
}

test("the staff account menu shows who is signed in, switches workspace and signs out", async ({ page }) => {
  const logouts = await staff(page, true);
  const button = page.getByRole("button", { name: /account menu/ });
  await expect(button).toContainText("Fictional Owner");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Signed in with Microsoft")).toBeVisible();
  await expect(page.getByText("Workspace role:")).toBeVisible();
  await expect(page.getByRole("link", { name: "Platform admin" }).last()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();

  await button.click();
  await page.getByRole("button", { name: /Fictional Provo/ }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("bridgeway.workspace"))).toBe("biz-b");

  await button.click();
  await page.getByRole("button", { name: "Sign out" }).last().click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(logouts()).toBe(1);
});

test("non-admins do not see the platform admin switch", async ({ page }) => {
  await staff(page, false);
  await page.getByRole("button", { name: /account menu/ }).click();
  await expect(page.locator(".account-menu-panel a[href='/admin']")).toHaveCount(0);
});

test("the admin console has an account menu with sign out", async ({ page }) => {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/session") return route.fulfill({ json: { ok: true, email: account.email, account: { ...account, provider: "Google" }, acceptingGlobally: true, smtpConfigured: true, stripeConfigured: true, monthlyPriceUsd: 149, canonicalOriginReady: true } });
    if (path === "/api/admin/businesses") return route.fulfill({ json: { businesses: [], totals: { businesses: 0, cards: 0, taps: 0, referrals: 0 } } });
    if (path === "/api/admin/demo-requests") return route.fulfill({ json: { requests: [] } });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin");
  const button = page.getByRole("button", { name: /account menu/ });
  await expect(button).toContainText("Platform admin");
  await button.click();
  await expect(page.getByText("Signed in with Google")).toBeVisible();
  await expect(page.getByRole("link", { name: "Business dashboard" })).toBeVisible();
  await page.mouse.click(5, 400);
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

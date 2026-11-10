import { expect, test } from "@playwright/test";

test("the homepage has two customer actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/staff/login");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Sign up", exact: true })).toHaveAttribute("href", "/signup");
  await expect(page.getByText("Book a demo", { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("signup sends the verified workspace to Checkout", async ({ page }) => {
  await page.route("**/api/signup", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { signedIn: true, enabled: true } });
    } else {
      expect(route.request().postDataJSON()).toEqual({ name: "Test Practice" });
      await route.fulfill({ json: { businessId: "signup-test", signupPending: true } });
    }
  });
  await page.route("**/api/staff/billing/checkout", async route => {
    expect(route.request().headers()["x-bridgeway-business"]).toBe("signup-test");
    await route.fulfill({ json: { url: "/signup?checkout=verified" } });
  });
  await page.goto("/signup");
  await page.getByLabel("Business name").fill("Test Practice");
  const primary = page.getByRole("button", { name: "Continue to Stripe" });
  await expect(primary).toHaveCSS("background-color", "rgb(135, 206, 235)");
  await expect(primary).toHaveCSS("color", "rgb(16, 36, 60)");
  await page.getByRole("button", { name: "Continue to Stripe" }).click();
  await expect(page).toHaveURL(/checkout=verified/);
});

test("resuming signup reuses its pending workspace and opens Checkout without a preset", async ({ page }) => {
  await page.route("**/api/signup", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { signedIn: true, enabled: true } });
    expect(route.request().postDataJSON()).toEqual({ name: "Another Business" });
    await route.fulfill({ json: { businessId: "signup-resumed", signupPending: true } });
  });
  await page.route("**/api/staff/billing/checkout", async route => {
    expect(route.request().headers()["x-bridgeway-business"]).toBe("signup-resumed");
    await route.fulfill({ json: { url: "/signup?checkout=verified" } });
  });
  await page.goto("/signup");
  await page.getByLabel("Business name").fill("Another Business");
  await page.getByRole("button", { name: "Continue to Stripe" }).click();
  await expect(page).toHaveURL(/checkout=verified/);
});

test("platform admin issues a card for the selected office", async ({ page }) => {
  const business = { businessId: "business-test", name: "Test Practice", cards: 0, taps: 0, referrals: 0 };
  const office = { id: "office-main", name: "Test Office", active: true };
  const partner = { id: "partner-test", name: "Test Partner", active: true };
  await page.route("**/api/admin/session", route => route.fulfill({ json: { acceptingGlobally: true, smtpConfigured: true, stripeConfigured: true } }));
  await page.route("**/api/admin/demo-requests", route => route.fulfill({ json: { requests: [] } }));
  await page.route("**/api/admin/businesses", route => route.fulfill({ json: { businesses: [business], totals: { businesses: 1, cards: 0, taps: 0, referrals: 0 } } }));
  await page.route("**/api/admin/businesses/business-test", route =>
    route.fulfill({ json: { business, offices: [office], partners: [partner], cards: [], members: [], invitations: [] } }));
  await page.route("**/api/admin/businesses/business-test/cards", async route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      officeId: office.id, partnerId: partner.id, partnerName: null, quantity: 1, label: null,
    });
    await route.fulfill({ status: 201, json: { partnerName: partner.name, cards: [{ id: "test-card", url: "/r/test-card" }] } });
  });
  await page.goto("/admin");
  const sections = page.getByRole("navigation", { name: "Admin sections" });
  await sections.getByRole("button", { name: "NFC cards", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect NFC cards" })).toBeVisible();
  await sections.getByRole("button", { name: "Create business", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create a business", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Businesses", exact: true })).toBeHidden();
  await sections.getByRole("button", { name: "Businesses", exact: true }).click();
  await page.getByRole("button", { name: "Test Practice" }).click();
  await expect(sections.getByRole("button", { name: "NFC cards", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Referring partner").selectOption(partner.id);
  await page.getByLabel("Receiving office").selectOption(office.id);
  await page.getByRole("button", { name: "Issue card links" }).click();
  await expect(page.getByText("/r/test-card", { exact: true })).toBeVisible();
});

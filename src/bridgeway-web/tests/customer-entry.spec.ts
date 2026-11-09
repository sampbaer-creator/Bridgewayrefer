import { expect, test } from "@playwright/test";

test("the homepage has two customer actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/staff/login");
  await expect(page.getByRole("link", { name: "Sign up", exact: true })).toHaveAttribute("href", "/signup");
  await expect(page.getByText("Book a demo", { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("signup sends the verified workspace to Checkout", async ({ page }) => {
  await page.route("**/api/signup", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { signedIn: true, enabled: true } });
    } else {
      expect(route.request().postDataJSON()).toEqual({ name: "Test Practice", preset: "dental" });
      await route.fulfill({ json: { businessId: "signup-test", signupPending: true } });
    }
  });
  await page.route("**/api/staff/billing/checkout", async route => {
    expect(route.request().headers()["x-bridgeway-business"]).toBe("signup-test");
    await route.fulfill({ json: { url: "/signup?checkout=verified" } });
  });
  await page.goto("/signup");
  await page.getByLabel("Business name").fill("Test Practice");
  await page.getByLabel("Business type").selectOption("dental");
  await page.getByRole("button", { name: "Continue to Stripe" }).click();
  await expect(page).toHaveURL(/checkout=verified/);
});

test("platform admin issues a card for the selected office", async ({ page }) => {
  const office = { id: "office-main", name: "Test Office" };
  await page.route("**/api/admin/businesses", route => route.fulfill({ json: { businesses: [{ businessId: "business-test", name: "Test Practice" }] } }));
  await page.route("**/api/admin/businesses/business-test/cards", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { signupPending: false, offices: [office], partners: [], cards: [] } });
    } else {
      expect(route.request().postDataJSON()).toEqual({ officeId: office.id, partnerId: "" });
      await route.fulfill({ status: 201, json: { id: "test-card", officeName: office.name, partnerName: "Direct card", url: "/r/test-card", active: true } });
    }
  });
  await page.goto("/admin");
  await page.getByLabel("Company or practice").selectOption("business-test");
  await page.getByLabel("Receiving office").selectOption(office.id);
  await page.getByRole("button", { name: "Issue card link" }).click();
  await expect(page.getByRole("link", { name: "/r/test-card" })).toHaveAttribute("href", "/r/test-card");
});

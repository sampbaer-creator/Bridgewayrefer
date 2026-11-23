import { expect, test } from "@playwright/test";

test("the shared public header keeps its position across routes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const header = page.locator(".public-header");
  const positions = async () => header.evaluate(element => {
    const selectors = [".brand", ".public-nav a", ".public-nav-cta"];
    return selectors.map(selector => {
      const rect = element.querySelector(selector)!.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /DM Sans Variable/);
  expect(await page.evaluate(() => Array.from(document.fonts).some(
    font => font.family.includes("DM Sans Variable") && font.status === "loaded",
  ))).toBe(true);
  await expect(header.locator(".public-nav-cta")).toHaveCSS("background-image", /^linear-gradient/);
  const home = await positions();
  for (const path of ["/industries/healthcare", "/industries/trades", "/pricing", "/sign-in"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const current = await positions();
    for (const [index, reference] of home.entries()) {
      expect(Math.abs(current[index].x - reference.x), path).toBeLessThanOrEqual(1);
      expect(Math.abs(current[index].y - reference.y), path).toBeLessThanOrEqual(1);
    }
  }
});

test("the mobile menu restores focus and navigates to homepage anchors", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/industries/trades");
  const toggle = page.getByRole("button", { name: "Open menu" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "FAQ" }).click();
  await expect(page).toHaveURL(/\/#faq$/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

for (const [width, columns] of [[1440, 4], [768, 2], [390, 1]]) {
  test(`pricing fits four setup steps in ${columns} columns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/pricing");
    const steps = page.getByRole("list", { name: "Setup steps" });
    await expect(steps.getByRole("listitem")).toHaveCount(4);
    const rows = await steps.getByRole("listitem").evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
    expect(new Set(rows).size).toBe(4 / columns);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("unavailable Managed Calling requires an explicit switch", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/signup", route => {
    if (route.request().method() === "POST") posts++;
    return route.fulfill({ json: { signedIn: true, enabled: true, plans: { workspace: { amountUsd: 50, available: true }, managedCalling: { amountUsd: 400, available: false } } } });
  });
  await page.goto("/signup?plan=managed-calling");
  await expect(page.getByText("Managed Calling is not available online right now.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact BridgeWay" })).toHaveAttribute("href", "/contact");
  await expect(page.getByRole("button", { name: /continue to stripe/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to Referral Workspace" }).click();
  await expect(page).toHaveURL(/plan=workspace$/);
  await expect(page.getByRole("region", { name: "Business signup" }).getByRole("radio", { name: /^referral workspace/i })).toBeChecked();
  expect(posts).toBe(0);
});

test("both signup providers receive the chosen plan", async ({ page }) => {
  await page.route("**/api/signup", route => route.fulfill({ json: { signedIn: false, enabled: true, plans: { workspace: { amountUsd: 50, available: true }, managedCalling: { amountUsd: 400, available: true } } } }));
  await page.route("**/api/auth/providers", route => route.fulfill({ json: { google: true } }));
  await page.goto("/signup?plan=managed-calling");
  for (const provider of ["Microsoft", "Google"]) {
    await expect(page.getByRole("link", { name: `Sign up with ${provider}` })).toHaveAttribute("href", new RegExp(`flow=signup&plan=managed-calling&provider=${provider.toLowerCase()}`));
  }
});

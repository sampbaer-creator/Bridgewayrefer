import { expect, test } from "@playwright/test";

const config = { stripe: true, managedCalling: true, email: true, identity: true };

test("platform admin creates a customer, sees email delivery and copies the payment link", async ({ page }) => {
  const customers: Record<string, unknown>[] = [];
  await page.route("**/api/admin/session", route => route.fulfill({ json: { acceptingGlobally: true, smtpConfigured: true, stripeConfigured: true } }));
  await page.route("**/api/admin/businesses", route => route.fulfill({ json: { businesses: [], totals: { businesses: 0, cards: 0, taps: 0, referrals: 0 } } }));
  await page.route("**/api/admin/financial", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/admin/onboarding", async route => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toMatchObject({ name: "Fictional Dental", ownerName: "Pat Owner", notes: "Met at the dental expo", ownerEmail: "owner@example.invalid", industry: "healthcare", specialty: "Orthodontics", plan: "managed-calling", sendEmail: true });
      customers.push({ businessId: "biz-a", name: "Fictional Dental", ownerName: "Pat Owner", notes: "Met at the dental expo", ownerEmail: "owner@example.invalid", plan: "managed-calling", status: "Awaiting payment", createdAt: "2026-11-24T12:00:00Z", linkExpiresAt: "2026-12-08T12:00:00Z", ownerSignedIn: false, canIssueLink: true });
      return route.fulfill({ status: 201, json: { businessId: "biz-a", link: "https://bridgewayrefer.com/onboard#token=abc&workspace=biz-a", email: "failed" } });
    }
    return route.fulfill({ json: { customers, config } });
  });
  await page.route("**/api/admin/onboarding/biz-a/link", async route => {
    expect(route.request().postDataJSON()).toEqual({ sendEmail: true });
    return route.fulfill({ json: { businessId: "biz-a", link: "https://bridgewayrefer.com/onboard#token=new&workspace=biz-a", email: "sent" } });
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Customer onboarding" }).click();
  const section = page.getByRole("region", { name: "Customer onboarding" });
  await section.getByLabel("Business name").fill("Fictional Dental");
  await section.getByLabel("Owner name").fill("Pat Owner");
  await section.getByLabel("Owner email").fill("owner@example.invalid");
  await section.getByLabel(/Notes/).fill("Met at the dental expo");
  await section.getByLabel("Specialty").fill("Orthodontics");
  await section.getByLabel("Plan").selectOption("managed-calling");
  await section.getByRole("button", { name: "Send payment and signup link" }).click();
  await expect(section.getByRole("status")).toContainText("Email delivery failed");
  await expect(section.getByLabel("Payment link")).toHaveValue(/onboard#token=abc/);
  await expect(section.getByRole("cell", { name: "Awaiting payment" })).toBeVisible();
  await expect(section.getByRole("cell", { name: /Pat Owner/ })).toBeVisible();
  await section.getByRole("button", { name: "Resend link" }).click();
  await expect(section.getByRole("status")).toContainText("Email sent to the owner");
  await expect(section.getByLabel("Payment link")).toHaveValue(/token=new/);
});

test("corporate customers get a follow-up record, not a payment link", async ({ page }) => {
  await page.route("**/api/admin/session", route => route.fulfill({ json: { acceptingGlobally: true } }));
  await page.route("**/api/admin/businesses", route => route.fulfill({ json: { businesses: [], totals: { businesses: 0, cards: 0, taps: 0, referrals: 0 } } }));
  await page.route("**/api/admin/financial", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/admin/onboarding", route => route.fulfill({ json: { config: { ...config, stripe: false }, customers: [
    { businessId: "biz-c", name: "Big Group", ownerEmail: "cfo@example.invalid", plan: "corporate", status: "Manual follow-up", createdAt: "2026-11-24T12:00:00Z", ownerSignedIn: false, canIssueLink: false },
  ] } }));
  await page.goto("/admin");
  await page.getByRole("button", { name: "Customer onboarding" }).click();
  const section = page.getByRole("region", { name: "Customer onboarding" });
  await expect(section.getByText("Stripe is not configured")).toBeVisible();
  await expect(section.getByRole("button", { name: "Send payment and signup link" })).toBeDisabled();
  await section.getByLabel("Plan").selectOption("corporate");
  await expect(section.getByRole("button", { name: "Save for follow-up" })).toBeEnabled();
  await expect(section.getByRole("link", { name: "Contact owner" })).toHaveAttribute("href", /^mailto:cfo@example\.invalid/);
  await expect(section.getByRole("button", { name: "Resend link" })).toHaveCount(0);
});

test("the owner signs in, sees setup pending, and is sent to Stripe Checkout", async ({ page }) => {
  let signedIn = false;
  const token = "a".repeat(64);
  await page.route("**/api/onboarding/status", route => {
    expect(route.request().postDataJSON()).toEqual({ workspace: "biz-a", token });
    return signedIn
      ? route.fulfill({ json: { businessName: "Fictional Dental", plan: "workspace", status: "awaiting_payment", paymentConfirmed: false } })
      : route.fulfill({ status: 401, json: {} });
  });
  await page.route("**/api/onboarding/checkout", route => {
    expect(route.request().postDataJSON()).toEqual({ workspace: "biz-a", token, confirmDetails: true });
    return route.fulfill({ json: { url: "/checkout-placeholder" } });
  });
  await page.route("**/checkout-placeholder", route => route.fulfill({ body: "<h1>Stripe Checkout</h1>", contentType: "text/html" }));

  await page.goto(`/onboard#token=${token}&workspace=biz-a`);
  await expect(page.getByRole("link", { name: /Sign in with Google/ })).toHaveAttribute("href", "/staff/login?flow=onboard&provider=google");
  expect(new URL(page.url()).hash).toBe(""); // the token leaves the address bar

  signedIn = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Finish setting up Fictional Dental" })).toBeVisible();
  await expect(page.getByText("Setup is pending")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "I confirm these details are correct." }).check();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("heading", { name: "Stripe Checkout" })).toBeVisible();
});

test("returning from Stripe waits for the verified webhook before opening the dashboard", async ({ page }) => {
  let confirmed = false;
  await page.addInitScript(() => sessionStorage.setItem("bridgeway.onboarding", JSON.stringify({ workspace: "biz-a", token: "b".repeat(64) })));
  await page.route("**/api/onboarding/status", route => {
    return route.fulfill({ json: { businessName: "Fictional Dental", plan: "workspace", status: confirmed ? "active" : "awaiting_payment", paymentConfirmed: false } });
  });
  await page.goto("/onboard?checkout=success");
  await expect(page.getByText("Waiting for Stripe to confirm")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open your dashboard" })).toHaveCount(0); // the redirect alone grants nothing
  confirmed = true; // the verified webhook has now activated the workspace
  await expect(page.getByRole("link", { name: "Open your dashboard" })).toBeVisible({ timeout: 10000 });
  expect(await page.evaluate(() => localStorage.getItem("bridgeway.workspace"))).toBe("biz-a");
});

test("an expired or replaced link explains how to get a new one", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("bridgeway.onboarding", JSON.stringify({ workspace: "biz-a", token: "c".repeat(64) })));
  await page.route("**/api/onboarding/status", route => route.fulfill({ status: 410, json: { error: "This setup link has expired or was replaced. Ask BridgeWay for a new link." } }));
  await page.goto("/onboard");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/expired or was replaced/);
  await expect(page.getByRole("button", { name: "Continue to payment" })).toHaveCount(0);
});

test("public signup links are special-case tiles that point admins to Customer onboarding", async ({ page }) => {
  await page.route("**/api/admin/session", route => route.fulfill({ json: { acceptingGlobally: true, publicOrigin: "https://bridgewayrefer.com" } }));
  await page.route("**/api/admin/businesses", route => route.fulfill({ json: { businesses: [], totals: { businesses: 0, cards: 0, taps: 0, referrals: 0 } } }));
  await page.route("**/api/admin/financial", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/admin/onboarding", route => route.fulfill({ json: { customers: [], config } }));
  await page.goto("/admin");
  await page.getByRole("button", { name: "Customer signup" }).click();
  const links = page.getByRole("region", { name: "Customer signup links" });
  for (const [name, path] of [["Referral Workspace", "plan=workspace"], ["Managed Calling", "plan=managed-calling"], ["Corporate", "plan=corporate"]]) {
    const tile = links.getByRole("article", { name: `${name} link` });
    await expect(tile.getByText(`bridgewayrefer.com/signup?${path}`)).toBeVisible();
    await expect(tile.getByRole("button", { name: `Copy ${name} link` })).toBeVisible();
  }
  await links.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("region", { name: "Customer onboarding" })).toBeVisible();
});

test("each public plan link opens a page for only that plan", async ({ page }) => {
  await page.route("**/api/signup", route => route.fulfill({ json: { signedIn: false, enabled: true, plans: { workspace: { amountUsd: 50, available: true }, managedCalling: { amountUsd: 400, available: true } } } }));
  await page.goto("/signup?plan=workspace");
  const signup = page.getByRole("region", { name: "Business signup" });
  await expect(signup.getByRole("heading", { name: "Set up Referral Workspace" })).toBeVisible();
  await expect(signup.getByRole("radio")).toHaveCount(0);
  await expect(signup.getByText(/Managed Calling/)).toHaveCount(0);
  await expect(signup.getByText(/Corporate/)).toHaveCount(0);

  await page.goto("/signup?plan=corporate");
  await expect(signup.getByRole("heading", { name: "Corporate plans" })).toBeVisible();
  await expect(signup.getByRole("link", { name: "Request a quote" })).toHaveAttribute("href", "/#walkthrough");
  await expect(signup.getByText(/Referral Workspace/)).toHaveCount(0);
  await expect(signup.getByRole("link", { name: /Sign up with/ })).toHaveCount(0);
});

for (const width of [1440, 1024, 768, 390]) {
  test(`owner review remains readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => sessionStorage.setItem("bridgeway.onboarding", JSON.stringify({ workspace: "biz-a", token: "d".repeat(64) })));
    await page.route("**/api/onboarding/status", route => route.fulfill({ json: {
      businessName: "Fictional Dental", ownerName: "Pat Owner", ownerEmail: "owner@example.invalid", alertEmail: "team@example.invalid", industry: "healthcare", specialty: "Orthodontics", monthlyPriceUsd: 50, plan: "workspace", status: "awaiting_payment", paymentConfirmed: false,
    } }));
    await page.goto("/onboard");
    await expect(page.getByRole("heading", { name: "Review your details" })).toBeVisible();
    await expect(page.getByText("$50/month", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
    await page.screenshot({ path: `test-results/onboarding-${width}.png`, fullPage: true });
  });
}

test("admin connects the sender mailbox and can request a test email", async ({ page }) => {
  let connected = false;
  await page.route("**/api/admin/session", route => route.fulfill({ json: { acceptingGlobally: true } }));
  await page.route("**/api/admin/businesses", route => route.fulfill({ json: { businesses: [], totals: { businesses: 0, cards: 0, taps: 0, referrals: 0 } } }));
  await page.route("**/api/admin/financial", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/admin/onboarding", route => route.fulfill({ json: { customers: [], config } }));
  await page.route("**/api/admin/email", route => route.fulfill({ json: { required: true, connected, email: "bridgewayrefer@outlook.com" } }));
  await page.route("**/api/admin/email/test", route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({});
    return route.fulfill({ json: { accepted: true } });
  });
  await page.goto("/admin?mailbox=wrong-account");
  const sender = page.getByRole("region", { name: "Sender email connection" });
  await expect(sender.getByText(/That was a different mailbox/)).toBeVisible();
  await expect(sender.getByRole("link", { name: "Connect sender mailbox" })).toHaveAttribute("href", "/api/admin/email/connect");
  await expect(sender.getByRole("button", { name: "Send test email" })).toHaveCount(0);
  connected = true;
  await page.goto("/admin?mailbox=connected");
  await expect(sender.getByText(/Connected to Microsoft/)).toBeVisible();
  await sender.getByRole("button", { name: "Send test email" }).click();
  await expect(sender.getByText(/Microsoft accepted the test email/)).toBeVisible();
});

test("test Stripe keys explain billing readiness before the admin submits a customer", async ({ page }) => {
  await page.route("**/api/admin/session", route => route.fulfill({ json: { acceptingGlobally: true } }));
  await page.route("**/api/admin/businesses", route => route.fulfill({ json: { businesses: [], totals: { businesses: 0, cards: 0, taps: 0, referrals: 0 } } }));
  await page.route("**/api/admin/financial", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/admin/email", route => route.fulfill({ json: { required: true, connected: true, email: "bridgewayrefer@outlook.com" } }));
  await page.route("**/api/admin/onboarding", route => route.fulfill({ json: { customers: [], config: { ...config, stripe: false, stripeIssue: "test_key" } } }));
  await page.goto("/admin?mailbox=setup");
  await expect(page.getByText(/Complete Stripe activation and configure live billing/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send payment and signup link" })).toBeDisabled();
});

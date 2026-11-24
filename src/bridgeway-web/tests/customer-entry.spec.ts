import { expect, test } from "@playwright/test";

test("staff sign-in opens the provider chooser before starting authentication", async ({ page }) => {
  await page.route("**/api/auth/providers", route => route.fulfill({ json: { google: true } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("link", { name: "Sign in with Microsoft" })).toHaveAttribute("href", "/staff/login?provider=microsoft");
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toHaveAttribute("href", "/staff/login?provider=google");
  await page.goto("/staff/login");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("the homepage has customer paths for both industries and one walkthrough form", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /Healthcare/ })).toHaveAttribute("href", "/industries/healthcare");
  await expect(main.getByRole("link", { name: /Trades/ })).toHaveAttribute("href", "/industries/trades");
  await expect(page.locator('a[href^="/signup"], a[href="/pricing"]')).toHaveCount(0);
  await expect(page.locator("#walkthrough + footer")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Request a walkthrough" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("signup sends the verified workspace to Checkout", async ({ page }) => {
  await page.route("**/api/signup", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { signedIn: true, enabled: true, plans: { workspace: { amountUsd: 50, available: true }, managedCalling: { amountUsd: 400, available: true } } } });
    } else {
      expect(route.request().postDataJSON()).toEqual({ name: "Test Practice", industry: "healthcare", specialty: "Orthodontics", plan: "workspace" });
      await route.fulfill({ json: { businessId: "signup-test", signupPending: true } });
    }
  });
  await page.route("**/api/staff/billing/checkout", async route => {
    expect(route.request().headers()["x-bridgewayrefer-business"]).toBe("signup-test");
    expect(route.request().postDataJSON()).toEqual({ plan: "workspace" });
    await route.fulfill({ json: { url: "/signup?checkout=verified" } });
  });
  await page.goto("/signup");
  await page.getByLabel("Business name").fill("Test Practice");
  await page.getByLabel("Industry", { exact: true }).selectOption("healthcare");
  await page.getByLabel("Business specialty", { exact: true }).selectOption("Orthodontics");
  const primary = page.getByRole("button", { name: "Continue to Stripe" });
  await expect(primary).toHaveCSS("background-color", "rgb(43, 53, 66)");
  await expect(primary).toHaveCSS("color", "rgb(253, 253, 254)");
  await page.getByRole("button", { name: "Continue to Stripe" }).click();
  await expect(page).toHaveURL(/checkout=verified/);
});

test("resuming signup reuses its pending workspace and opens Checkout without a preset", async ({ page }) => {
  await page.route("**/api/signup", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { signedIn: true, enabled: true, plans: { workspace: { amountUsd: 50, available: true }, managedCalling: { amountUsd: 400, available: true } } } });
    expect(route.request().postDataJSON()).toEqual({ name: "Another Business", industry: "trades", specialty: "Plumbing", plan: "workspace" });
    await route.fulfill({ json: { businessId: "signup-resumed", signupPending: true } });
  });
  await page.route("**/api/staff/billing/checkout", async route => {
    expect(route.request().headers()["x-bridgewayrefer-business"]).toBe("signup-resumed");
    expect(route.request().postDataJSON()).toEqual({ plan: "workspace" });
    await route.fulfill({ json: { url: "/signup?checkout=verified" } });
  });
  await page.goto("/signup");
  await page.getByLabel("Business name").fill("Another Business");
  await page.getByLabel("Industry", { exact: true }).selectOption("trades");
  await page.getByLabel("Business specialty", { exact: true }).selectOption("Plumbing");
  await page.getByRole("button", { name: "Continue to Stripe" }).click();
  await expect(page).toHaveURL(/checkout=verified/);
});

test("Managed Calling signup carries the $400 plan through resumed Stripe Checkout", async ({ page }) => {
  let signupCalls = 0;
  let checkoutCalls = 0;
  await page.route("**/api/signup", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { signedIn: true, enabled: true, plans: { workspace: { amountUsd: 50, available: true }, managedCalling: { amountUsd: 400, available: true } } } });
    expect(route.request().postDataJSON()).toEqual({ name: "Calling Practice", industry: "healthcare", specialty: "Cardiology", plan: "managed-calling" });
    signupCalls++;
    await route.fulfill({ json: { businessId: "signup-calling", signupPending: true } });
  });
  await page.route("**/api/staff/billing/checkout", async route => {
    expect(route.request().headers()["x-bridgewayrefer-business"]).toBe("signup-calling");
    expect(route.request().postDataJSON()).toEqual({ plan: "managed-calling" });
    checkoutCalls++;
    await route.fulfill(checkoutCalls === 1 ? { status: 503, json: { error: "Temporary Checkout issue" } } : { json: { url: "/signup?checkout=managed-calling" } });
  });
  await page.goto("/signup?plan=managed-calling");
  await expect(page.getByRole("region", { name: "Business signup" }).getByRole("radio", { name: /Managed Calling.*\$400\/month/ })).toBeChecked();
  await page.getByLabel("Business name").fill("Calling Practice");
  await page.getByLabel("Industry", { exact: true }).selectOption("healthcare");
  await page.getByLabel("Business specialty", { exact: true }).selectOption("Cardiology");
  await page.getByRole("button", { name: "Continue to Stripe" }).click();
  await expect(page.getByText("Temporary Checkout issue", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue to Stripe" }).click();
  await expect(page).toHaveURL(/checkout=managed-calling/);
  expect(signupCalls).toBe(2);
  expect(checkoutCalls).toBe(2);
});

test("platform admin issues a card for the selected office", async ({ page }) => {
  let issued = false;
  const business = { businessId: "business-test", name: "Test Practice", cards: 0, taps: 0, referrals: 0 };
  const office = { id: "office-main", name: "Test Office", active: true };
  const partner = { id: "partner-test", name: "Test Partner", active: true };
  await page.route("**/api/admin/session", route => route.fulfill({ json: { acceptingGlobally: true, smtpConfigured: true, stripeConfigured: true } }));
  await page.route("**/api/admin/demo-requests", route => route.fulfill({ json: { requests: [] } }));
  await page.route("**/api/admin/businesses", route => route.fulfill({ json: { businesses: [business], totals: { businesses: 1, cards: 0, taps: 0, referrals: 0 } } }));
  const card = { id: "test-card", label: "", url: "/r/test-card", active: true, partnerName: "Test Partner", officeName: "Test Office", taps: 0, referrals: 0 };
  await page.route("**/api/admin/businesses/business-test/cards/test-card/preview", route =>
    route.fulfill({ json: { accepting: true, officeName: "Test Office", businessName: "Test Practice", welcomeText: "Welcome to Test Practice", logoUrl: "/brand-mark.png" } }));
  await page.route("**/api/admin/businesses/business-test", route =>
    route.fulfill({ json: { business, offices: [office], partners: [partner], cards: issued ? [card] : [], members: [], invitations: [] } }));
  await page.route("**/api/admin/businesses/business-test/cards", async route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      officeId: office.id, partnerId: partner.id, partnerName: null, quantity: 1, label: null,
    });
    issued = true;
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
  await expect(page.getByText("/r/test-card", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Preview patient form" }).click();
  const preview = page.getByRole("dialog", { name: "Patient form preview" });
  await expect(preview.getByText("Welcome to Test Practice", { exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Send my request" })).toBeDisabled();
  await preview.getByRole("button", { name: "Close preview" }).click();
  await expect(preview).toHaveCount(0);
});


for (const industry of ["healthcare", "trades", "other"]) {
  test(`signup saves a custom specialty for ${industry}`, async ({ page }) => {
    let posted = false;
    await page.route("**/api/signup", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: { signedIn: true, enabled: true } });
      expect(route.request().postDataJSON()).toMatchObject({ industry, specialty: "Custom practice" });
      posted = true;
      return route.fulfill({ status: 503, json: { error: "Saved request verified" } });
    });
    await page.goto("/signup");
    await page.getByLabel("Business name").fill("Custom Business");
    await page.getByLabel("Industry", { exact: true }).selectOption(industry);
    await page.getByLabel("Business specialty", { exact: true }).selectOption("custom");
    await page.getByRole("button", { name: "Continue to Stripe" }).click();
    expect(posted).toBe(false);
    await page.getByLabel("Your business specialty").fill("   ");
    await page.getByRole("button", { name: "Continue to Stripe" }).click();
    expect(posted).toBe(false);
    await page.getByLabel("Your business specialty").fill("  Custom practice  ");
    await page.getByRole("button", { name: "Continue to Stripe" }).click();
    await expect(page.getByRole("region", { name: "Business signup" }).getByRole("alert")).toHaveText("Saved request verified");
    expect(posted).toBe(true);
    await page.getByLabel("Industry", { exact: true }).selectOption(industry === "healthcare" ? "trades" : "healthcare");
    await expect(page.getByLabel("Business specialty", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Your business specialty")).toHaveCount(0);
  });
}

test("platform admin edits a business logo and can archive and restore the workspace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let deleted = false;
  let business = { businessId: "business-test", name: "Test Practice", cards: 0, taps: 0, referrals: 0, logoUrl: "", archived: false, patientCardCode: "", etag: "version-1" };
  await page.route("**/api/admin/session", route => route.fulfill({ json: { acceptingGlobally: true, smtpConfigured: true, stripeConfigured: true } }));
  await page.route("**/api/admin/demo-requests", route => route.fulfill({ json: { requests: [] } }));
  await page.route("**/api/admin/businesses", route => route.fulfill({ json: { businesses: deleted ? [] : [business], totals: { businesses: Number(!business.archived && !deleted), cards: 0, taps: 0, referrals: 0 } } }));
  await page.route("**/api/admin/businesses/business-test/activity", route => route.fulfill({ json: {
    activity: [{ id: "audit-test", action: "platform-upload-business-logo", actor: "platform:owner", createdAt: "2025-01-01T12:00:00Z" }],
  } }));
  await page.route("**/api/admin/businesses/business-test/logo", async route => {
    expect(route.request().postDataJSON()).toEqual({ image: Buffer.from("sample image").toString("base64"), etag: business.etag });
    business = { ...business, logoUrl: "/brand-mark.png", etag: business.etag + "x" };
    await route.fulfill({ json: { logoUrl: business.logoUrl } });
  });
  await page.route("**/api/admin/businesses/business-test", async route => {
    if (route.request().method() === "DELETE") {
      expect(business.archived).toBe(false);
      expect(route.request().postDataJSON()).toEqual({ etag: business.etag, name: business.name });
      deleted = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (route.request().method() === "PATCH") {
      const { etag, ...changes } = route.request().postDataJSON();
      expect(etag).toBe(business.etag);
      business = { ...business, ...changes, etag: business.etag + "x" };
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { business, offices: [], partners: [], cards: [{ id: "patient-card", label: "", officeName: "Main Office", partnerName: "Partner", active: true, url: "/r/patient-card" }], members: [{ id: "test-member", email: "owner@example.com", role: "Admin", etag: "member-etag" }], invitations: [] } });
  });

  await page.goto("/admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".admin-table")).toHaveCSS("overflow-y", "visible");
  await expect(page.locator(".admin-table")).toHaveCSS("max-height", "none");
  await expect(page.locator(".admin-metrics")).toHaveCSS("display", "grid");
  await page.setViewportSize({ width: 390, height: 844 });
  const businessButton = page.getByRole("button", { name: "Test Practice", exact: true });
  await businessButton.click();
  await page.getByRole("button", { name: "Business settings" }).click();
  await page.locator("#admin-logo-file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("sample image") });
  await expect(page.getByRole("img", { name: "Test Practice logo" })).toHaveAttribute("src", "/brand-mark.png");
  await page.getByLabel("Logo URL").fill("");
  await page.getByRole("button", { name: "Save logo" }).click();
  await expect(page.getByRole("img", { name: "Test Practice logo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Patient form", exact: true }).click();
  await page.getByLabel("Default wording").selectOption("consultation");
  await page.getByLabel("Page headline").fill("A brighter smile starts here.");
  await page.getByLabel("Submit button text").fill("Request a visit");
  let trackingRequests = 0;
  await page.route("**/api/link-opens", async route => { trackingRequests++; await route.abort(); });
  await page.getByRole("button", { name: "Preview patient form" }).click();
  const preview = page.getByRole("dialog", { name: "Patient form preview" });
  await expect(preview.getByRole("heading", { name: "A brighter smile starts here." })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Request a visit" })).toBeDisabled();
  await expect(preview.getByLabel("ZIP or postal code")).toBeVisible();
  expect(trackingRequests).toBe(0);
  await preview.getByRole("button", { name: "Close preview" }).click();
  await page.getByLabel("Welcome message").fill("Welcome to Test Practice.");
  await page.getByLabel("Receiving office and partner").selectOption("patient-card");
  await page.getByRole("button", { name: "Save patient form" }).click();
  await expect(page.getByRole("link", { name: "Open patient link" })).toHaveAttribute("href", "/p/business-test");
  await expect(page.getByRole("status")).toContainText("Business updated");

  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText("upload business logo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove access" })).toBeDisabled();
  await page.getByRole("button", { name: "Business settings" }).click();

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Archive business", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Business archived");
  await expect(businessButton).toHaveCount(0);
  await page.getByLabel("Filter by status").selectOption("Archived");
  await businessButton.click();
  await page.getByRole("button", { name: "Restore business" }).click();
  await expect(businessButton).toBeVisible();
  await businessButton.click();
  await page.getByRole("button", { name: "Business settings" }).click();
  await page.getByRole("button", { name: "Patient form", exact: true }).click();
  await expect(page.getByLabel("Welcome message")).toHaveValue("Welcome to Test Practice.");
  await expect(page.getByLabel("Page headline")).toHaveValue("A brighter smile starts here.");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Unpublish patient page" }).click();
  await expect(page.getByRole("link", { name: "Open patient link" })).toHaveCount(0);
  await page.getByRole("button", { name: "Business settings" }).click();
  await page.getByRole("button", { name: "Delete workspace", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "Delete workspace" });
  const confirm = deletion.getByRole("button", { name: "Delete workspace" });
  await expect(confirm).toBeDisabled();
  await deletion.getByLabel("Enter the workspace name to confirm").fill(" Test Practice ");
  await confirm.click();
  await expect(page.getByRole("status")).toContainText("Workspace deleted from admin.");
  await expect(businessButton).toHaveCount(0);
});

test("platform admin can schedule and undo Stripe cancellation", async ({ page }) => {
  const business = { businessId: "biz-stripe", name: "Billing Practice", billingStatus: "active", hasStripeSubscription: true };
  let cancelAtPeriodEnd = false;
  await page.route("**/api/admin/session", route => route.fulfill({ json: { acceptingGlobally: true } }));
  await page.route("**/api/admin/demo-requests", route => route.fulfill({ json: { requests: [] } }));
  await page.route("**/api/admin/businesses", route => route.fulfill({ json: { businesses: [business] } }));
  await page.route("**/api/admin/businesses/biz-stripe", route => route.fulfill({ json: {
    business, cards: [], partners: [], offices: [], members: [], invitations: [],
  } }));
  await page.route("**/api/admin/businesses/biz-stripe/stripe", route => {
    if (route.request().method() === "PATCH") {
      expect(route.request().postDataJSON()).toEqual({ cancelAtPeriodEnd: !cancelAtPeriodEnd });
      cancelAtPeriodEnd = !cancelAtPeriodEnd;
    }
    return route.fulfill({ json: { status: "active", cancelAtPeriodEnd, dashboardUrl: "https://dashboard.stripe.com/test/subscriptions/sub_example" } });
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Billing Practice" }).click();
  await page.getByRole("button", { name: "Business settings" }).click();
  const stripe = page.getByRole("region", { name: "Stripe subscription" });
  await expect(stripe.getByRole("link", { name: "Open in Stripe" })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await stripe.getByRole("button", { name: "Cancel at period end" }).click();
  await expect(stripe.getByRole("status")).toHaveText("Cancellation scheduled in Stripe.");
  page.once("dialog", dialog => dialog.accept());
  await stripe.getByRole("button", { name: "Undo cancellation" }).click();
  await expect(stripe.getByRole("status")).toHaveText("Cancellation undone in Stripe.");
});

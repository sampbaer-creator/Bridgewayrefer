import { test, expect, type APIRequestContext } from "@playwright/test";

const origin = "http://localhost:3000";

async function createFixture(request: APIRequestContext, name: string, preset: "dental" | "trades" = "dental") {
  const response = await request.post("/api/staff/businesses", {
    headers: { Origin: origin, "X-BridgeWay-Business": "demo-business" },
    data: { name, preset, testFixture: true },
  });
  if (response.status() !== 201) throw new Error(`Could not create the fictional browser fixture (HTTP ${response.status()}): ${await response.text()}`);
  return (await response.json()) as { businessId: string; name: string };
}

async function removeFixture(request: APIRequestContext, businessId: string) {
  const response = await request.delete("/api/staff/test-fixtures/" + encodeURIComponent(businessId), {
    headers: { Origin: origin, "X-BridgeWay-Business": businessId },
  });
  expect([204, 404]).toContain(response.status());
}

test("admin creates a fictional office and card, submits once, and follows it up", async ({ page, request }) => {
  const token = crypto.randomUUID();
  const business = await createFixture(request, `Fictional Dental ${token}`);
  const partnerName = `Fictional Referrer ${token}`;
  const officeName = `Fictional Receiving Office ${token}`;
  const contactName = `Fictional Contact ${token.slice(0, 8)}`;

  try {
    await page.addInitScript((businessId: string) => localStorage.setItem("bridgeway.workspace", businessId), business.businessId);
    await page.goto("/staff");
    await expect(page.getByRole("heading", { name: "Referral inbox" })).toBeVisible();

    await page.getByLabel("Add partner").fill(partnerName);
    await page.getByRole("button", { name: "Add partner" }).click();
    await expect(page.getByText(partnerName, { exact: true }).first()).toBeVisible();

    await page.getByLabel("Add receiving office").fill(officeName);
    await page.getByRole("button", { name: "Add receiving office" }).click();
    await expect(page.getByText(officeName, { exact: true }).first()).toBeVisible();

    await page.getByLabel("Create card link").selectOption({ label: partnerName });
    await page.getByLabel("Receiving office").selectOption({ label: officeName });
    await page.getByRole("button", { name: "Create card" }).click();
    await expect(page.getByText("Card link created.", { exact: true })).toBeVisible();
    const card = page.locator(".card-row").filter({ hasText: partnerName }).filter({ hasText: officeName }).last();
    const href = await card.locator("small").textContent();
    const cardUrl = href?.match(/https?:\/\/\S+/)?.[0];
    expect(cardUrl).toBeTruthy();
    const code = new URL(cardUrl!).pathname.split("/").at(-1)!;

    await card.getByRole("button", { name: "QR code" }).click();
    await expect(card.getByRole("img", { name: `QR code for ${partnerName}` })).toBeVisible();
    await page.goto(cardUrl!);
    await expect(page.getByText(officeName, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Let’s get acquainted." })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByLabel("First name").fill("Fictional");
    await page.getByLabel("Last name").fill(contactName);
    await page.getByLabel("Email address").fill(`fictional+${token}@example.invalid`);
    await page.getByLabel("Phone number").fill("8015550100");
    await page.getByLabel("Anything you’d like us to know?").fill("Fictional verification only.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Request my consultation" }).click();
    await expect(page.getByRole("heading", { name: "We look forward to meeting you." })).toBeVisible();

    await page.goto("/staff");
    const patient = page.locator(".referral").filter({ has: page.getByRole("heading", { name: `Fictional ${contactName}`, exact: true }) });
    await expect(patient).toBeVisible();
    await expect(patient).toContainText(partnerName);
    await expect(patient).toContainText(officeName);
    await patient.getByLabel(`Status for Fictional ${contactName}`).selectOption("Scheduled");
    await expect(patient.getByLabel(`Status for Fictional ${contactName}`)).toHaveValue("Scheduled");
    expect(code).toMatch(/^[a-f0-9]{36}$/);
  } finally {
    await removeFixture(request, business.businessId);
  }
});

test("fictional API retries are idempotent and workspace scoped", async ({ request }) => {
  const token = crypto.randomUUID();
  const business = await createFixture(request, `Fictional Trades ${token}`, "trades");
  const headers = { Origin: origin, "X-BridgeWay-Business": business.businessId };
  try {
    const partner = await request.post("/api/staff/partners", { headers, data: { name: `Fictional Partner ${token}` } });
    expect(partner.status()).toBe(201);
    const partnerId = (await partner.json()).id as string;
    const cardResponse = await request.post("/api/staff/cards", { headers, data: { partnerId, officeId: "office-main" } });
    expect(cardResponse.status()).toBe(201);
    const { code } = (await cardResponse.json()) as { code: string };
    const submissionId = crypto.randomUUID();
    const data = { firstName: "Fictional", lastName: `API ${token.slice(0, 8)}`, email: `fictional+${token}@example.invalid`, phone: "8015550101", notes: "Fictional only", consent: true, code, submissionId };
    const first = await request.post("/api/referrals", { headers: { Origin: origin }, data });
    expect(first.status()).toBe(201);
    expect((await request.post("/api/referrals", { headers: { Origin: origin }, data })).status()).toBe(200);

    const inboxResponse = await request.get("/api/staff/referrals", { headers });
    const inbox = await inboxResponse.json();
    const rows = inbox.referrals.filter((row: { id: string }) => row.id === "ref-" + submissionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("Fictional");
    expect(rows[0].status).toBe("New");
    expect(rows[0].cardId).toBe(code);
    expect(rows[0].businessId).toBe(business.businessId);

    const other = await createFixture(request, `Isolated Fictional ${token}`, "dental");
    try {
      const otherInbox = await (await request.get("/api/staff/referrals", { headers: { ...headers, "X-BridgeWay-Business": other.businessId } })).json();
      expect(otherInbox.referrals.some((row: { id: string }) => row.id === rows[0].id)).toBe(false);
      expect((await request.patch("/api/staff/referrals/" + rows[0].id, { headers: { ...headers, "X-BridgeWay-Business": other.businessId }, data: { status: "Closed", etag: rows[0].etag } })).status()).toBe(404);
    } finally {
      await removeFixture(request, other.businessId);
    }

    expect((await request.post("/api/referrals", { headers: { Origin: origin }, data: { ...data, consent: false, submissionId: crypto.randomUUID() } })).status()).toBe(400);
    expect((await request.get("/health/cosmos")).ok()).toBe(true);
  } finally {
    await removeFixture(request, business.businessId);
  }
});

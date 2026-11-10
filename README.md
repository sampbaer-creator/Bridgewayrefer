# BridgeWay — C#, React and Azure Cosmos DB

Referral intake and an office dashboard, migrated from Flask/Jinja to ASP.NET Core 10 and React/Next.js. The original navy, off-white, serif headings, practice logo, patient form and dashboard layout are preserved in React. Python and Jinja are no longer runtime dependencies.

## How the product works

1. **You (platform admin)** sign in at `/admin`. Create a business (this also creates its main office and emails nothing; you send the invite link shown), then issue NFC card links for a referring partner. Write each `https://YOUR-SITE/r/<code>` URL to an NFC tag.
2. **Someone taps a card.** `/r/<code>` records a tap and shows that business's branded referral form.
3. **The business** signs in at `/staff` with the invited email: referral inbox, taps vs. referrals by partner, staff invites, profile, alert email and Stripe billing.

A business accepts referrals only when all of these are true: `BridgeWay__AcceptReferrals=true` globally, intake is on in its profile, you have not suspended it, and its Stripe subscription is `active`, `trialing` or `past_due` **or** you marked it billing-exempt in `/admin`.

## Run locally

Requires .NET 10 SDK, Node 24, Azure CLI and a Cosmos DB data-plane role for your identity. Put the Entra settings below in .NET user secrets (`dotnet user-secrets set ... --project src/BridgeWay.Api`) including `BridgeWay:PlatformAdminObjectIds:0` = your Entra object ID.

```powershell
az login
./scripts/Initialize-Cosmos.ps1
./scripts/Start-Local.ps1
```

Then open http://localhost:3000/admin, create a business, issue a card, and open its URL.

### Removing old demo data

Earlier versions seeded fictional records (`demo-business`, `demo-trades`, cards `demo-west-office` / `demo-hvac-referral`, `test-e2e-*` partitions). Remove them once from any database that has them:

```powershell
$env:Cosmos__Endpoint = 'https://YOUR-ACCOUNT.documents.azure.com:443/'
$env:Cosmos__Database = 'bridgeway-dev'
dotnet run --project src/BridgeWay.Api -- --purge-demo-data
```

For production, use a new database (for example `bridgeway-prod`) rather than reusing the development one.

## Cosmos data model

Account `bridgeway-dev-nosql`, resource group `BridgeWay`, database `bridgeway-dev`.

| Container | Partition key | Manual throughput | Records |
|---|---|---|---|
| `card-directory` | `/id` | 400 RU/s | Public office cards, active flag, business/office/partner routing IDs |
| `business-operations` | `/businessId` | 400 RU/s | Business settings, referrals, audit history, link-open events, email outbox and rate buckets |

Total provisioned throughput is **800 RU/s**, within the account's **1000 RU/s** cap and opted-in free tier. Initialization verifies the active subscription, inspects all account throughput, reuses existing resources and refuses incompatible partition keys or an over-budget creation. It does not change existing container throughput. No optional knowledge/AI container is created.

Private staff queries use the workspace selected from the signed-in user’s active memberships. The platform console validates its separate administrator role before choosing a business. Public endpoints return only display fields. Referrals and email jobs share a partition and are created atomically. Status changes and audit records are atomic and require the caller's current ETag. Card administration writes audit intent before the cross-container change.

The inbox shows the newest 500 records. Reporting reads all retained summaries and computes submission-month totals in `America/Denver`, including DST, inactive offices, historical office names, previous-month comparisons and a 12-month trend. At larger volumes, replace full summary scans with maintained aggregates and paginated inbox queries.

## Production configuration

The API refuses to start in production unless HTTPS origin, Entra sign-in, at least one platform admin, `Cosmos:Database` and a Key Vault key for Data Protection are configured. Keep secrets in App Service settings / Key Vault, never in tracked JSON.

| Setting | Purpose |
|---|---|
| `Cosmos__Endpoint` | Cosmos HTTPS endpoint (managed identity, no key) |
| `Cosmos__Database` | e.g. `bridgeway-prod`. Required; no fallback outside Development |
| `DataProtection__KeyVaultKeyUri` | Key Vault key ID used to encrypt the cookie key ring stored in Cosmos. Grant the API identity *Key Vault Crypto User* |
| `BridgeWay__PublicOrigin` | Exact browser origin, `https://...` |
| `BridgeWay__AcceptReferrals` | Global intake switch (`true` to go live) |
| `BridgeWay__TenantId` / `ClientId` / `ClientSecret` | Entra app registration (redirect URI `https://YOUR-SITE/signin-oidc`) |
| `BridgeWay__Authority` | Optional. For customer staff outside your Microsoft tenant, use an **Entra External ID** tenant: `https://TENANT.ciamlogin.com/TENANT-ID/v2.0` (and that tenant's ID/app) |
| `BridgeWay__PlatformAdminObjectIds__0` | Your Entra object ID; add `__1`, `__2` for more platform admins |
| `BridgeWay__StripeSecretKey` | `sk_live_...` (or `rk_live_...`). Test keys still work for staging |
| `BridgeWay__StripePriceId` | Recurring monthly USD price in the same mode as the key |
| `BridgeWay__StripeWebhookSecret` | `whsec_...` for `https://YOUR-SITE/api/stripe/webhook` |
| `BridgeWay__MonthlyPriceUsd` | Must equal the Stripe price (default 50) |
| `BRIDGEWAY_API_ORIGIN` | Frontend server's API origin, set at build and runtime |

Stripe webhook events to send: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Enable the Customer Portal in Stripe.

Existing Data Protection keys written before Key Vault was configured remain unencrypted in the operations container (`type = data-protection-key`, partition `bridgeway-platform`). Delete them after switching; everyone signs in again once.

Give the API managed identity *Cosmos DB Built-in Data Contributor* scoped to the database. Place the API behind the Next.js server or a restricted proxy; it trusts one forwarded hop.

## Customer entry and card administration

The homepage links to staff sign-in and /signup. Signup requires a verified Entra identity. With the current single-tenant setup, onboard outside customers as Entra guests before sending them to signup. Customer signup is opt-in. Configure Entra and Stripe test Checkout before setting `BridgeWay__CustomerSignupEnabled=true` for a pilot. The signed-in owner creates or resumes one workspace, pays through Stripe, and sees the dashboard after a verified active subscription is recorded. Existing staff workspaces keep their current access. Signup workspaces start with referral intake closed.

The platform card desk is at /admin. Set `BridgeWay__PlatformAdminObjectIds__0` to the Entra object ID of a platform administrator. This role is separate from customer workspace Admin. Select the business and receiving office, then choose or create a referring partner and copy the generated /r/<code> URL to program the physical NFC card. Customer staff can see the cards and referral statistics for their own workspace. Existing cards keep their codes.

## Email alerts

The C# background worker replaces `notifications.py`. It sends generic dashboard links without patient details, uses Cosmos ETag leases, resumes pending work after restart, and retries with capped exponential delays. Delivery is at least once: a crash after SMTP acceptance can produce a duplicate; stable message IDs help mail clients group retries.

Configure `BridgeWay__AlertsEnabled=true`, `BridgeWay__SmtpHost`, `BridgeWay__SmtpPort` (465 for implicit TLS, otherwise STARTTLS), `BridgeWay__SmtpUsername` and `BridgeWay__SmtpPassword` through secret storage. Each business's recipient is its **alert email**, set in `/admin` or by the business admin in their profile; the worker picks up changes without a restart. Business admins can send a test alert. No external email was sent during migration verification. Actual SMTP delivery needs the authorized sender configuration and a mailbox test. Keep a hosted worker running continuously if alerts must send without site traffic.

## Verification and packaging

```powershell
dotnet test tests/BridgeWay.Api.Tests
npm.cmd ci --prefix src/bridgeway-web
npm.cmd run build --prefix src/bridgeway-web
# Mocked dashboard race test (no Azure needed):
npx --prefix src/bridgeway-web playwright test tests/staff-report-race.spec.ts
# Optional Cosmos transaction/isolation/lease test, using CLI identity:
$env:BRIDGEWAY_LIVE_TESTS = '1'
dotnet test tests/BridgeWay.Api.Tests
```

The browser test mocks the API. The separate live storage test uses its own temporary business partition and removes its test records afterward. CI builds the API and frontend, runs offline C# parity/authorization tests, and publishes build artifacts. It does not deploy or use Azure credentials. The copied Python/Azure Table deployment workflow and infrastructure were removed.

To package manually: `dotnet publish src/BridgeWay.Api -c Release -o artifacts/api`, then `npm run build` in `src/bridgeway-web`. For Next standalone hosting, copy `public` and `.next/static` into `.next/standalone` as shown in the CI workflow, then run `node server.js`. Set `BRIDGEWAY_API_ORIGIN` consistently during build and runtime because rewrites are included in the build. No App Service or frontend cloud deployment is created by these commands.

See [migration and record mapping](docs/migration.md). Backups, retention/deletion policies, production identity, actual mail delivery and hosting still require deployment-specific configuration before real patient data is accepted. Existing local data files and Azure Table data have not been deleted.

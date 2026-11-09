# BridgeWay — C#, React and Azure Cosmos DB

Referral intake and an office dashboard, migrated from Flask/Jinja to ASP.NET Core 10 and React/Next.js. The original navy, off-white, serif headings, practice logo, patient form and dashboard layout are preserved in React. Python and Jinja are no longer runtime dependencies.

## Run locally

Requires .NET 10 SDK, Node 24, Azure CLI and a signed-in identity with Cosmos DB for NoSQL data-plane access. No Cosmos key is required.

```powershell
az login
az account show --query '{name:name,id:id}'
./scripts/Initialize-Cosmos.ps1
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:Cosmos__Endpoint = 'https://bridgeway-dev-nosql.documents.azure.com:443/'
dotnet run --project src/BridgeWay.Api -- --seed
./scripts/Start-Local.ps1 -Demo
```

`-Demo` explicitly enables fictional intake and local staff access. Both processes bind to loopback. Without `-Demo`, intake is closed and staff authentication is required. The API refuses demo staff access outside Development and in Azure App Service. Logs and process IDs are in the ignored `.local` directory. The script reuses occupied ports without stopping other processes; check the logs if an unrelated app owns a port.

- Patient form: http://localhost:3000/
- Demo card: http://localhost:3000/r/demo-west-office
- Staff dashboard: http://localhost:3000/staff
- Cosmos readiness: http://127.0.0.1:5180/health/cosmos → `{"status":"connected"}`

For interactive terminals, run `./scripts/Start-Local.ps1 -Service api -Demo` and `./scripts/Start-Local.ps1 -Service web` separately after building the API and installing frontend dependencies.

## Cosmos data model

Account `bridgeway-dev-nosql`, resource group `BridgeWay`, database `bridgeway-dev`.

| Container | Partition key | Manual throughput | Records |
|---|---|---|---|
| `card-directory` | `/id` | 400 RU/s | Public office cards, active flag, business/office/partner routing IDs |
| `business-operations` | `/businessId` | 400 RU/s | Business settings, referrals, audit history, link-open events, email outbox and rate buckets |

Total provisioned throughput is **800 RU/s**, within the account's **1000 RU/s** cap and opted-in free tier. Initialization verifies the active subscription, inspects all account throughput, reuses existing resources and refuses incompatible partition keys or an over-budget creation. It does not change existing container throughput. No optional knowledge/AI container is created.

Private queries and point reads always use the configured `BridgeWay:BusinessId`. The server chooses the business; request bodies cannot select another business. Public endpoints return only display fields. Referrals and email jobs share a partition and are created atomically. Status changes and audit records are atomic and require the caller's current ETag. Card administration writes audit intent before the cross-container change.

The inbox shows the newest 500 records. Reporting reads all retained summaries and computes submission-month totals in `America/Denver`, including DST, inactive offices, historical office names, previous-month comparisons and a 12-month trend. At larger volumes, replace full summary scans with maintained aggregates and paginated inbox queries.

## Staff sign-in outside local demo

The C# API owns an encrypted, HttpOnly staff cookie and an Entra OpenID Connect authorization-code flow with PKCE. Next.js proxies `/api/*`, `/staff/login` and `/signin-oidc` to the API. Raw identity headers are not trusted. Every staff endpoint checks the signed-in tenant and explicit user object ID allowlist.

Register a single-tenant **Web** application with redirect URI `https://YOUR-FRONTEND/signin-oidc`. Configure these API settings using environment variables or .NET user secrets; never put client secrets in tracked JSON:

| Setting | Purpose |
|---|---|
| `Cosmos__Endpoint` | Cosmos HTTPS endpoint |
| `Cosmos__Database` | `bridgeway-dev` |
| `BridgeWay__BusinessId` | Server-bound business partition |
| `BridgeWay__OfficeName` | Receiving office display name |
| `BridgeWay__PublicOrigin` | Exact browser origin, HTTPS in production |
| `BridgeWay__AcceptReferrals` | `true` to open intake after validation |
| `BridgeWay__LocalDemoStaff` | `false` outside local fictional testing |
| `BridgeWay__TenantId` | Entra tenant ID |
| `BridgeWay__ClientId` | Web app registration ID |
| `BridgeWay__ClientSecret` | App registration credential, secret storage only |
| `BridgeWay__StaffObjectIds__0` | First allowed user object ID; increment index for additional staff |
| `BRIDGEWAY_API_ORIGIN` | Frontend server's API origin, e.g. `http://127.0.0.1:5180` |

For hosted Cosmos access, give the API managed identity Cosmos DB Built-in Data Contributor scoped to this database (or a narrower custom role). Azure subscription Owner/Contributor does not itself grant Cosmos item access. For local development, `DefaultAzureCredential` can use `az login`. The current developer identity has database-scoped data access.

Production must place the API behind a private or restricted reverse proxy, terminate browser HTTPS, persist/share ASP.NET Data Protection keys across replicas and restarts, and configure the trusted proxy address for forwarded client IPs. The default forwarded-header trust is loopback only. Review origin settings, staff allowlist and end-to-end Entra sign-in on the actual host before opening intake. Staff sign-in has automated authorization tests but has not been validated against a configured production app registration in this workspace.

## Email alerts

The C# background worker replaces `notifications.py`. It sends generic dashboard links without patient details, uses Cosmos ETag leases, resumes pending work after restart, and retries with capped exponential delays. Delivery is at least once: a crash after SMTP acceptance can produce a duplicate; stable message IDs help mail clients group retries.

Configure `BridgeWay__AlertsEnabled=true`, `BridgeWay__AlertRecipient`, `BridgeWay__SmtpHost`, `BridgeWay__SmtpPort` (465 for implicit TLS, otherwise STARTTLS), `BridgeWay__SmtpUsername` and `BridgeWay__SmtpPassword` through secret storage. `BridgeWay__AlertRecipient` applies only to `BridgeWay__BusinessId`. Set `BridgeWay__AlertRecipients__<businessId>` for each additional workspace. The staff dashboard exposes configuration status and a test button. Alerts are disabled locally by default. No external email was sent during migration verification. Actual SMTP delivery needs the authorized sender configuration and a mailbox test. Keep a hosted worker running continuously if alerts must send without site traffic.

## Verification and packaging

```powershell
dotnet test tests/BridgeWay.Api.Tests
npm.cmd ci --prefix src/bridgeway-web
npm.cmd run build --prefix src/bridgeway-web
# With the fictional local demo running:
npm.cmd run test:e2e --prefix src/bridgeway-web
# Optional Cosmos transaction/isolation/lease test, using CLI identity:
$env:BRIDGEWAY_LIVE_TESTS = '1'
dotnet test tests/BridgeWay.Api.Tests
```

The browser suite creates fictional referral and office examples in Cosmos. The separate live storage test uses its own temporary business partition and removes its test records afterward. CI builds the API and frontend, runs offline C# parity/authorization tests, and publishes build artifacts. It does not deploy or use Azure credentials. The copied Python/Azure Table deployment workflow and infrastructure were removed.

To package manually: `dotnet publish src/BridgeWay.Api -c Release -o artifacts/api`, then `npm run build` in `src/bridgeway-web`. For Next standalone hosting, copy `public` and `.next/static` into `.next/standalone` as shown in the CI workflow, then run `node server.js`. Set `BRIDGEWAY_API_ORIGIN` consistently during build and runtime because rewrites are included in the build. No App Service or frontend cloud deployment is created by these commands.

See [migration and record mapping](docs/migration.md). Backups, retention/deletion policies, production identity, actual mail delivery and hosting still require deployment-specific configuration before real patient data is accepted. Existing local data files and Azure Table data have not been deleted.

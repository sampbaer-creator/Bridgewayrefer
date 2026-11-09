# Flask/Table Storage to C#/React/Cosmos

## Replacement map

| Previous implementation | Replacement |
|---|---|
| `app.py`, `LocalStore`, `AzureStore` | `src/BridgeWay.Api/Program.cs`, `Endpoints.cs`, `CosmosStore.cs` |
| `reporting.py` | `MonthlyReport.cs` |
| `notifications.py` | `AlertWorker.cs` (MailKit, TLS, durable Cosmos leases) |
| `templates/base.html` | React root layout, Header component and local public assets |
| `templates/form.html` | `PublicPage` and `PatientForm` |
| `templates/staff.html` | `StaffDashboard` and `OfficeReport` |
| `templates/sign_in.html` | `/sign-in` React page |
| `static/style.css` | `src/bridgeway-web/app/globals.css`, preserving original tokens and responsive rules |
| `static/app.js`, `reporting.js`, `tracking.js` | React state, event handlers, effects and same-origin API calls |
| Python tests and deployment files | C# parity/authorization tests, Playwright integration suite and C#/React verification workflow |

## Legacy entity mapping

The old SQLite database used one `entities(p,k,data)` table, and Azure Table Storage used `PartitionKey`/`RowKey` with the same document payloads. Cosmos uses two containers, rather than one container for every old table.

| Old partition / row | Cosmos container / type | ID and retained fields |
|---|---|---|
| `doctors` / card code | `card-directory` | `id=RowKey`, `officeName=name`, `active`, `createdAt`; adds business, office and partner routing IDs |
| `records` / `ref-*` | `business-operations` / `referral` | `id=RowKey`; name, email, phone, notes, doctor attribution, status, creation/update dates and consent history |
| `records` / `audit-*` | `business-operations` / `audit` | Actor, action, target and timestamp |
| `records` / `alert-*` | `business-operations` / `alert` | Historical state and attempts; imports are parked to prevent resending old alerts |
| `traffic` / `open-*` | `business-operations` / `link-open` | Office attribution and event timestamp |
| `rate` / hourly bucket | `business-operations` / `rate` for new traffic | Old expired buckets are omitted; new buckets expire after two hours |

All private records receive the operator-selected `BridgeWay:BusinessId`. Migrate one business per export. Keep exports private and outside the repository; the importer prints counts only. Existing IDs are skipped, so rerunning does not overwrite records or duplicate referrals. Historical card codes and `/r/{code}` links stay the same when the public hostname is retained.

## Import an existing export

No legacy SQLite database was found at the repository root during this migration. No old Azure Table endpoint is configured in the new app. The demo data was created directly in Cosmos. **Porting the data model does not copy an unseen legacy production table.**

If old data exists, export it privately as a JSON array of the old entities (with `PartitionKey`, `RowKey`, and payload fields). For SQLite, export the JSON from the `data` column; for Azure Tables, export the entities with those keys. Back up the source first and stop old writes before final cutover. Use an authorized storage/export tool for the old environment; the new runtime does not retain the legacy Table SDK or SQLite fallback.

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:Cosmos__Endpoint = 'https://bridgeway-dev-nosql.documents.azure.com:443/'
$env:BridgeWay__BusinessId = 'YOUR-BUSINESS-ID'
dotnet run --project src/BridgeWay.Api -- --import 'C:\private\legacy-export.json'
```

Compare source and destination counts for cards, referrals, audit rows and link opens; compare monthly totals and sample statuses and consent timestamps. Imported alert jobs are retained as `Imported` with no automatic delivery. Review those separately if any pending notifications must be recovered. The importer does not delete source data or modify existing Cosmos records. Keep the source backup under the office's retention policy.

## Verified replacement behavior

The C# tests cover Mountain Time/DST boundaries, leap years, uncapped report totals, invalid dates/months, inactive/former offices, contact validation, consent, honeypots, staff tenant/user checks, spoofed identity header rejection and origin/JSON enforcement. Playwright exercises real Cosmos intake, inbox/status changes, ETag conflicts, duplicate retries, office creation, deactivation/reactivation, month/trend controls and mobile overflow checks.

The original logo files were copied byte-for-byte before deleting their old static paths. Legacy source remains recoverable from Git history. Python, Jinja, old static scripts, Azure Table provisioning and the copied SSO deployment scripts are removed from the working tree. No existing storage accounts, tables or local data files were removed.

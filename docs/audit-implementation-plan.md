# BridgeWay audit implementation plan

## Goal and completion standard

Make the path from an office buying BridgeWay to receiving and following up on a real referral dependable, understandable, and measurable. Preserve the Next.js frontend, C# API, Cosmos model, business isolation, and current restrained visual style.

This plan covers the supplied website audit and the independent repository review. It separates code delivered in this branch, deployment validation, business decisions, and later product work. A task is not complete because a page renders or an environment variable exists: record the trigger, observed result, environment, source revision, and any remaining limitation.

Base revision: `a6a0c2539c0cdf83b2b760471a64b94c227008a7`. Recheck current main before continuing. Do not overwrite concurrent work.

## Current branch scope

Implemented, pending review and deployment verification:

- Dental-specific homepage copy and a public walkthrough/contact request path using the existing demo-request API and existing admin lead inbox.
- Pricing/setup explanation, security information, and factual privacy/service summaries. Final legal documents, operator details, support commitments, and healthcare agreements still need owner review.
- Metadata, canonical homepage/public pages, sitemap, robots file, favicon, social sharing image, SoftwareApplication structured data, noindex for private/intake routes, and HSTS.
- General missing-page messaging separated from unavailable referral links; improved wordmark contrast and removal of blank feature icons.
- Workspace activation checklist and clearer signup expectations.
- Parameterized tenant-scoped server search, unresolved filtering, received-date filters, continuation pagination, and a Load more action.
- Saved next-action text/deadline, explicit UTC normalization, concurrency checks, and overdue state based on a missed deadline instead of referral age.
- Alert failure/stall visibility, admin retries, and explicit per-referral recovery of a missing alert with a deterministic identifier.
- Trialing subscription reconciliation opens the signup gate. No new trial length or commercial offer is enabled.
- Admin diagnostic for the configured public origin, and fewer repeated analytics reads during background refresh.
- XML cryptography dependency pin to the patched 10.0.13 package, with regression checks. The package is explicitly pinned because the Key Vault data-protection dependency otherwise restores an older XML package.

Not claimed complete: Azure changes, Entra external customer provisioning, real Stripe transactions, SMTP inbox delivery, actual NFC hardware tests, patient deduplication, configurable industry workflows, guardian/contact separation, partner status sharing, business-specific reporting timezones, analytics aggregation, and measured marketing performance.

## Execution rules

1. Work on a branch. Preserve user changes and inspect repository AGENTS.md instructions.
2. Use the installed Next.js version's local documentation before changing framework APIs.
3. Preserve Entra issuer/tenant validation, active memberships, roles, business partition checks, mutation Origin validation, ETags, webhook signatures, and idempotency.
4. Keep fixtures local or in an isolated disposable test environment. Do not seed production with fictional people or trigger real notifications merely to test a page.
5. Reuse existing functionality. The app already has statuses, assignments, history, partner/cohort reports, QR links, admin card issuance, and an admin demo-request inbox.
6. Do not publish invented card prices, shipping guarantees, testimonials, conversion statistics, HIPAA claims, BAA availability, or competitor exclusivity.
7. Coordinate production changes only after recording settings/revisions, preparing rollback, and verifying the candidate release. No database purge or broad tenant-access relaxation is part of this plan.
8. Track status as implemented, locally tested, staging verified, production verified, owner input needed, or blocked. Avoid a single done flag.

## Workstream 1: canonical origin and sign-in

**Priority:** launch blocker. **Owner:** engineering/cloud operator.

Inspect the API's effective PublicOrigin, Entra authority/tenant/application, registered callback URL, web-to-API rewrite origin, custom-domain ingress, certificate binding, and supported aliases. Read only the non-secret settings needed for diagnosis.

The intended canonical public origin is `https://bridgewayrefer.com`. Set the API PublicOrigin and the Entra callback registration together so `/signin-oidc` returns to the same domain. Generated invite, card, notification, and billing URLs must use it. Preserve the private API origin used by the frontend rewrite. Rebuild the web image if a build-time rewrite changes.

Do not derive a trusted origin directly from arbitrary Host or forwarded headers. Do not allow every Origin as a workaround. Verify www DNS and certificate before enabling its redirect; the previous local resolver error was not authoritative proof of NXDOMAIN.

**Acceptance:** from a fresh browser session on the canonical domain, login returns there, session lookup succeeds, an authorized write succeeds, a cross-origin write is rejected, and logout removes the session. Card/invite/payment return links use the canonical host. No infrastructure hostname is required in the ordinary customer journey.

**Rollback:** restore the prior revision and matching PublicOrigin/callback settings together. Keep recorded previous values without copying secrets into the report.

## Workstream 2: external customer identity

**Priority:** launch blocker. **Owner:** engineering/cloud operator.

Determine whether the product uses workforce Entra with B2B guests or an Entra External ID tenant. Application workspace invitations do not create directory guests. Test an unrelated office account, rather than testing only the founder's tenant account.

For B2B, document and automate the guest onboarding process using an appropriately authorized operator. For External ID, configure customer flows and verify stable tenant/object claims before changing authorization code. Evaluate Google/email alternatives only within that deliberate identity design.

**Acceptance:** an invited external user reaches only the intended workspace; an uninvited user cannot read it; revoked and expired invitations fail; Staff cannot perform Admin actions; a spoofed business header does not grant access. Exercise multiple memberships and workspace switching.

**Do not:** fix login by removing the tenant check or trusting email/header claims without the corresponding identity validation.

## Workstream 3: first usable referral link and card fulfillment

**Priority:** launch blocker. **Owner:** product/operations plus engineering.

Decide whether a referring office retains a reusable card, gives a card to each patient, or supports both. The UI and supplier quantities must match the actual handoff. Record card unit/bundle price, minimum order, design process, shipping cost/range, replacement policy, and who activates cards. Publish approved facts only.

The initial checklist is implemented. Next, add a tenant-scoped card-request record with states Requested, Preparing, Issued, Shipped, and Delivered where applicable, plus an admin fulfillment view. Prefer one digital link per referring partner/receiving office relationship, with multiple physical cards able to share that relationship when desired.

Allow digital QR/link testing once a valid link is issued. Keep physical writing/activation responsibility explicit. Do not require a customer to discover the platform administrator manually.

**Acceptance:** a new paid or authorized trial workspace can see what remains, request its first links, and know when they are usable. A card resolves to the correct business, receiving office, and referring partner. Deactivation and replacement behave predictably. Billing exemption remains an explicit administrative choice.

## Workstream 4: referral search and pagination

**Priority:** high. **Owner:** engineering.

The branch replaces the 500-record ceiling with continuation pages and parameterized filters. All searches retain the selected business partition. The dashboard distinguishes loaded rows from total history.

Validate against an isolated Cosmos database with more than 500 records and an old unresolved referral. Test filters across page boundaries, empty pages with continuation tokens, expired tokens, quoted search strings, date ranges, concurrent inserts, and workspace changes during delayed responses. Ensure stale data cannot reappear after revocation or a workspace switch.

**Acceptance:** an old unresolved record can be found and updated; search covers retained records; loading another page preserves filters; an invalid token gives a recoverable error; another business's records never appear. Track RequestCharge and query latency with realistic data.

**Remaining refinement:** persistent page selection after background refresh, true total counts if needed, and indexed search strategy if substring filtering becomes expensive. Do not present page counts as global totals.

## Workstream 5: follow-up deadlines and contact history

**Priority:** high. **Owner:** engineering/product.

The branch implements nextAction and nextActionAt with ETags and an audit event. Terminal statuses clear the action deadline. Dates entered in the workstation timezone are sent with an explicit offset and normalized to UTC. Missing deadlines are not treated as missed promises.

Next add contact attempts with channel, timestamp, result, and staff actor; store internal notes separately from patient-submitted notes. Add appointment timing, closure reasons, and Today/Overdue/My work views. Decide business-day rules and a per-business timezone before automating deadlines. Existing cases should retain history; do not rewrite their original creation times.

**Acceptance:** a future scheduled visit is not overdue due to creation age; a missed action is overdue; clearing a deadline removes that state; concurrent edits conflict safely; a closed case cannot receive a new due date until reopened; UTC/DST boundaries are correct.

## Workstream 6: alerts and recovery

**Priority:** high. **Owner:** engineering/cloud operator.

The branch surfaces failures and stalls, retries failed alerts for administrators, and permits an administrator to queue a single missing notification. Existing alert IDs prevent duplicates. It does not automatically send a historical backlog.

Configure the chosen SMTP provider, secret references, per-business recipient, sender authentication, and delivery observability. Send a controlled test only to an authorized test recipient. Distinguish Queued, Retry, SMTP accepted, Failed, and actual delivery/bounce signals if supported by the provider. A deterministic Message-ID is not a guarantee of deduplication by all mail systems.

**Acceptance:** normal submission produces one referral and one eligible alert; concurrent workers claim correctly; worker termination recovers after its lease; provider failure retries within limits; exhausted attempts are visible; manual retry works; a missing alert can be queued once; notifications contain no patient details. Record actual inbox receipt separately from server acceptance.

**Remaining:** operator notification for failure growth and a deliberate policy for suspended workspaces/recipient changes. Preserve the outbox's at-least-once semantics and explain rare possible duplicates.

## Workstream 7: billing and trial lifecycle

**Priority:** high. **Owner:** engineering and founder.

The branch allows `trialing` to complete customer signup. It does not create a free trial or change the advertised $50 plan.

Decide trial duration, whether a payment method is required, when the trial starts, card fulfillment during trial, reminders, cancellation, grace period, and expired-account data access. Keep trial timing useful if cards are shipped. Then configure Checkout trial parameters and subscription reconciliation consistently. Confirm the actual Price currency, monthly interval, quantity, tax behavior, and test/live mode.

**Acceptance:** active and trialing subscriptions get intended access; incomplete/canceled/expired states follow policy; duplicate/out-of-order webhooks do not corrupt state; replacement subscriptions are validated; failed checkout can resume; test keys never create live billing; no real charge is made without the user's explicit transaction authorization.

**Tests:** signed webhook fixtures, mode mismatch, invoice failure, trial expiry, cancellation at period end, concurrent checkout clicks, and Stripe-hosted billing return navigation.

## Workstream 8: patient intake and identity

**Priority:** next product release. **Owner:** product/engineering.

Observe several real handoffs before changing field requirements. Decide whether one contact method is enough. If so, align API validation and HTML requirements rather than making only a visual change. A child's patient identity and guardian's contact identity should be separate when needed. Keep clinical attachments outside this minimal intake until the operational/contractual scope is settled.

Introduce possible-duplicate review within the workspace using normalized contact signals, not automatic household merges. Same-UUID retry idempotency already exists. Preserve separate legitimate referrals and their partner attribution. An optional patient acknowledgement requires a dedicated delivery purpose, consent wording, template, and outbox behavior; current notifications are staff alerts.

**Acceptance:** a patient understands the recipient and next step; guardian details do not overwrite patient identity; validation works on mobile; retries do not create duplicates; suspected duplicates can be reviewed without losing history; submission confirmation never falsely claims an appointment is booked.

## Workstream 9: dental and trades configuration

**Priority:** after a working dental pilot. **Owner:** product/engineering.

Keep the initial marketing audience dental-focused. Add a businessType or workflow configuration and map it to labels, optional fields, allowed statuses, and outcome definitions. Preserve existing stored status values through an explicit migration/mapping, including Quoted/Won for trades.

**Acceptance:** dental users see relevant stages; trades users retain useful commercial stages; backend validates the selected workflow; historical data still renders; status changes remain audited. Do not delete historical states just to simplify the dropdown.

## Workstream 10: reporting accuracy, timezone, and cost

**Priority:** high correctness, later optimization. **Owner:** engineering/product.

The branch explains that link opens are events, not unique patients or verified physical taps, and that completed outcomes are grouped by submission cohort. Background analytics reads are throttled, while explicit refresh remains available.

Add per-business timezone configuration with a legacy America/Denver default. Distinguish referrals received in month, appointments scheduled in month, cases completed in month, and eventual outcomes of a submission cohort. Add first-contact and scheduling rates only with defined denominators. Do not infer realized revenue from a Completed status.

Instrument RU charges, duration, throttling and alert latency without logging patient details. Move history lookups to targeted queries and date-bound analytics. Add aggregates/change-feed processing when measured cost justifies it; retain raw data for reconciliation and make aggregate rebuild idempotent.

**Acceptance:** month boundaries/DST match the chosen timezone; cohort versus event-month results are labeled; reports reconcile with fixtures; large histories do not require repeated full scans for ordinary inbox polling.

## Workstream 11: trust, content, and discoverability

**Priority:** launch basics now; growth after pilot. **Owner:** founder/content plus engineering.

The branch supplies metadata, public discovery routes and factual service pages. Owner review must add approved business/operator identity, support contact, retention/deletion policy, subprocessors, incident/support commitments, cancellation/refund terms, and any required healthcare agreement. Do not call these final legal documents just because routes exist.

Verify canonical URLs, crawler responses, social image, favicon, HTTPS and www redirect. Verify Search Console and inspect actual URLs; a sitemap does not guarantee indexing and an empty site: result is not conclusive. Keep private/intake routes noindex and out of sitemaps without treating robots as authorization.

Publish a truthful screenshot/walkthrough using isolated fixtures. Add real approved testimonials only after usage. Sindi already supports no-account senders, and competitors market to endodontists; avoid exclusivity claims. Recheck competitor prices at publication. There is no established ten-review requirement for AI visibility, and FAQ rich results are not a reliable growth tactic for this product.

**Acceptance:** an office manager can identify audience, benefit, price, card process, and contact path before paying. Metadata describes visible content. No invented customers, unsupported health claims or made-up savings appear.

## Workstream 12: permissioned partner feedback

**Priority:** validate in pilot, then implement. **Owner:** product/security engineering.

Design updates to a verified referring office separately from public intake links. Consider a short-lived recipient-bound access link or authorized partner account, minimum data exposure, consent/legal purpose, expiry, revocation, and access audit. Begin with Received/Scheduled/Completed confirmation before clinical report sharing.

**Acceptance:** possessing a shared NFC link never permits reading patient status; recipients see only authorized referrals; expiry/revocation and negative cross-business tests pass.

## Release sequence

1. Review this branch, run full CI and inspect the new public pages. Resolve test failures before release.
2. Verify pagination, actions, notification recovery, and webhook state changes in an isolated environment connected to Cosmos and Stripe test mode.
3. Coordinate the canonical origin and Entra callback, then test an external office identity.
4. Review public policy/service text and approve actual card pricing/fulfillment details.
5. Deploy matching web/API revisions, recording images, source SHA and rollback revisions. No destructive schema migration is required by this branch; optional referral fields are additive.
6. Run the controlled production acceptance checklist. Do not send fictional patient emails or run live-writing tests against production.
7. Pilot with one receiving practice and a small set of referring offices. Observe staff behavior and measure time to first usable link, first referral and first follow-up.
8. Use pilot evidence to choose intake, industry workflows, trial, partner feedback and marketing expansion work. Avoid broad paid acquisition before activation works.

## Required evidence before declaring launch ready

- Full C# tests and production web build pass; browser suite passes in an environment that can launch Chromium.
- Readiness script passes public routes/metadata and confirms the Microsoft callback's canonical origin.
- Cosmos integration proves cross-workspace isolation and retrieval of a historical unresolved case beyond the old cap.
- External invited user signs in and performs only permitted actions.
- One controlled NFC/QR link resolves correctly; one permitted submission appears once for the right office; staff receive the appropriate generic alert.
- Follow-up edit, deadline, status transition and assignment persist across reload.
- Stripe test lifecycle and duplicate/reordered webhook cases pass, with no unintended live charge.
- Owner has supplied commercial facts and reviewed legal/healthcare requirements.
- Monitoring and rollback are documented; no unresolved failure is hidden behind a success label.

## Local verification notes for this branch

Commands: `dotnet test tests/BridgeWay.Api.Tests --configuration Release`; `dotnet publish src/BridgeWay.Api --configuration Release`; `npm ci`, `npm run build`, and `npx playwright test` from `src/bridgeway-web`.

The live Cosmos test is deliberately opt-in and must target disposable test partitions. Local browser execution may be blocked by environment restrictions; in that case record the exact launch failure and rely on a successful GitHub Actions browser job before claiming browser coverage. Never report a mocked frontend test as proof that Azure, Stripe, or SMTP worked.

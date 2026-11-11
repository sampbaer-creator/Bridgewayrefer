# Codex execution prompt: finish and verify BridgeWay audit remediation

Paste the following into Codex while working in a checkout of `sampbaer-creator/Bridgewayrefer` with the audit-readiness branch available.

```text
You are implementing and validating BridgeWay Refer, a live multi-business referral platform at https://bridgewayrefer.com. The stack is Next.js/React/TypeScript, a C# ASP.NET Core API, Azure Cosmos DB for NoSQL, Microsoft Entra authentication, Stripe subscriptions, and an SMTP outbox worker.

Read docs/audit-implementation-plan.md completely. Treat its acceptance criteria and explicit unknowns as the work ledger. Inspect current main, the audit-readiness PR/branch, all applicable AGENTS.md instructions, and recent deployment notes before changing code. The original reviewed revision was a6a0c2539c0cdf83b2b760471a64b94c227008a7. Reconcile newer work instead of overwriting it. Read the installed Next.js documentation before using framework APIs.

Goal: complete the necessary implementation and produce evidence that a normal external office can subscribe or enter an authorized trial, obtain a valid referral link, accept a referral, receive a staff notification, assign follow-up, and track the case through completion. Also make the public site truthful, understandable, accessible, and discoverable. Work through the task rather than only giving advice.

Use a branch and small reviewable commits. Preserve production data. Keep fictional fixtures out of production. Preserve ETags, active memberships, business partition checks, staff/admin permissions, Origin validation, webhook signatures, Stripe mode checks and idempotency. Never remove tenant validation or allow arbitrary Origins to work around authentication errors. Do not expose secrets, patient details, or private email data in logs or reports. Do not use public NFC links as authorization to read referrals.

First create/update a status matrix for every workstream in the plan: implemented, locally tested, staging verified, production verified, owner input needed, blocked. Record actual tests and results. Keep code delivery separate from cloud configuration and hardware verification. Do not mark a task complete based only on compilation or an enabled flag.

Existing features must be reused: referral statuses, owner assignment, history, monthly partner/cohort reporting, QR generation, platform-admin card issuance, demo-request storage and the admin lead inbox, outbox retry/lease logic, Stripe billing, and workspace membership authorization. The audit-readiness branch adds public contact, SEO/trust surfaces, activation checklist, parameterized paginated referral search, follow-up deadlines, failure visibility, missing-alert recovery and trialing signup reconciliation. Inspect these implementations and their tests instead of rebuilding blindly.

Execute in this order:

1. Baseline and review.
   Run C# tests and the web production build. Inspect browser CI. Verify dependencies resolve without the earlier high-severity XML package warnings. Review changed routes and data models. Confirm frontend/API compatibility. Treat a Chromium launch restriction as an environment blocker, not as a passing browser test.

2. Canonical origin and external sign-in.
   Inspect effective Azure Container App PublicOrigin, private rewrite origin, Entra authority/tenant/client, callback registrations, ingress/certificate and DNS settings using the already authorized environment. Do not print secrets. Prepare a coordinated change to https://bridgewayrefer.com and /signin-oidc. Record rollback first. Test a fresh session, authorized mutation, rejected wrong-origin mutation, logout, invite links, card URLs, notification URLs and billing return URLs. Verify an unrelated office identity, not just the founder's Microsoft tenant. A workspace invite does not create an Entra guest. Choose workforce B2B provisioning or External ID deliberately. Ask only for required missing identity/configuration decisions, after preparing everything that does not depend on them.

3. First-card activation.
   Verify the existing checklist reflects effective intake and billing readiness. Implement a clear tenant-scoped card request and fulfillment status path if needed. Reuse existing administrator issuance. Specify receiving office and referring partner; preserve attribution. Permit QR/copied-link testing once a valid link is issued. Show the physical-card dependency before subscription. Collect actual approved card prices, quantities, shipping and replacement facts; do not invent them. Confirm whether referring offices retain reusable cards or hand them out.

4. Search and daily work.
   Validate parameterized server filtering and continuation tokens against an isolated Cosmos dataset containing more than 500 referrals. Find an old unresolved case, paginate filtered results, edit it and retain its history. Test invalid cursors/date ranges, empty continuation pages, concurrent inserts, stale responses, revocation and workspace switching. Keep per-page counts explicitly scoped. Make background refresh behavior predictable for loaded historical pages. Put follow-up before analytics.

5. Follow-up scheduling and history.
   Validate nextAction/nextActionAt, explicit timezone offsets, ETag conflicts, terminal-state clearing and future scheduled cases. Add contact-attempt history and appointment timing as separate audited fields/documents. Add My work, Due today and Overdue views, without making every old referral overdue. Decide business timezone/business hours before automating due dates. Preserve historical creation dates and patient notes.

6. Alert health and recovery.
   Test the worker, leases, retries, maximum attempts, failed/stalled UI and per-referral missing-alert recovery. Verify admin-only retry/recovery and deterministic IDs. Do not auto-send a historical backlog. Configure the authorized test recipient and provider, and distinguish queueing, SMTP acceptance and actual delivery. Keep patient details out of staff emails. Test interruption/recovery and rare duplicate-delivery scenarios. Add actionable operator monitoring.

7. Billing and trial lifecycle.
   Confirm trialing and active subscriptions unblock the intended signup path. Obtain the trial duration/start/card-fulfillment decision before enabling a commercial offer. Align checkout, webhook reconciliation, access, intake, expiry, cancellation and grace period. Test duplicate/out-of-order webhooks and failed/resumed/replacement checkout in Stripe test mode. Preserve signature/mode/customer/workspace checks. Do not make a live charge without explicit transaction authorization.

8. Patient intake and duplicate handling.
   Validate mobile submission, success/error/focus states and consent. Separate guardian contact from child identity where applicable. Decide whether one contact method is sufficient and enforce the same rule in frontend/API. Add possible-duplicate review within the business using normalized signals, not automatic merging of people who share a household email/phone. Same-submission-ID retry idempotency must remain intact. Do not claim patient confirmation emails exist unless implementing and testing that separate notification purpose.

9. Industry workflow configuration.
   Keep dental launch messaging focused while preserving trades capability. Make allowed stages/labels/optional fields business-specific with backward-compatible mappings. Do not erase Quoted/Won history. Validate statuses on the API as well as the UI.

10. Reporting correctness and efficiency.
    Label link-open events accurately; they are not verified NFC taps or unique patients. Separate submission-cohort outcomes from events completed within a calendar month. Use per-business timezones with an explicit legacy default. Define first-contact, scheduling and completion denominators. Measure Cosmos RU charges and latency, target history queries, and bound analytics reads. Add aggregates only with idempotent reconciliation and a measured need. Never report Completed as realized revenue without an actual revenue model.

11. Public trust and SEO.
    Review audience/outcome copy, actual price/card terms, contact form and its admin response path, footer navigation, privacy/service/security pages, metadata/canonical URLs, sitemap/robots, favicon, share image, noindex on private/intake routes, general versus card 404s, HSTS and www redirect. Do not describe factual service summaries as final legal agreements. Get approved operator/contact/retention/support/healthcare facts. Never invent testimonials, guarantees, savings, HIPAA certification or BAA availability. Never claim competitors all require sender accounts; Sindi offers no-account referral forms. Verify current vendor sources before comparisons. Use Search Console for index status. Do not promise indexing from a sitemap, FAQ rich results, or a ten-review AI-visibility threshold.

12. Partner feedback.
    Validate customer demand before implementing. If building it, use verified recipient-bound access with expiry, revocation, minimal patient information and access audit. Public intake links must never reveal private status. Test unauthorized and cross-business access before sending any notification.

13. Release and pilot verification.
    Run complete CI, publish/build artifacts, inspect desktop/mobile states, and test the complete chain in an isolated environment connected to real test integrations. Record matching source SHA, web/API image tags, revision names, configuration changes and rollback. Production deployment must follow the repository's release rules and any required final approval. Do not purge or seed production. Observe one receiving practice and a small referring-office pilot. Measure first usable link, first referral, first contact, scheduled outcomes, weekly usage, alert failure rate and support time. Do not turn pilot hypotheses into marketing claims.

For every code change add meaningful regression tests for behavior and access boundaries. Avoid tests that only assert the implementation's spelling. Test negative cases, stale requests and real persistence where practical. Existing frontend route mocks do not prove Cosmos/Stripe/SMTP integration.

Deliver:
- Updated workstream status matrix and exact remaining blockers.
- Reviewable commits/PR with a concise problem/behavior description.
- Test/build results with environment limitations and skipped checks stated.
- Deployment runbook and rollback steps based on observed resources.
- Owner decisions listed only where necessary, with prepared options and consequences.
- No claim that everything is live until the production acceptance evidence exists.

Use concise direct progress updates, no em dashes, and no invented completion claims. Continue independently on authorized reversible work when another step is blocked.
```

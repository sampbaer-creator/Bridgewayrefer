# Referral reporting semantics

BridgeWay reports activity by event month in `America/Denver`:

- A referral belongs to the local calendar month of its `createdAt` submission timestamp.
- A link open belongs to the local calendar month of its `createdAt` timestamp. This measure is called **link opens** because NFC taps, QR scans, and shared URLs can all create an open.
- A completed request belongs to the local month of the first `Completed` or `Won` status-history event. One referral counts once overall. A later correction or second terminal label does not double count it.
- A referral submitted in November and completed in December contributes a November referral and a December outcome. The monthly outcome count is an event volume and is not divided by same-month submissions; those are different populations.
- New status-history events retain `partnerId`, `officeId`, and `cardId`, so an outcome remains attributed if its source referral is outside a bounded submission window. Legacy history without attribution falls back to the referral record when available. A legacy terminal record with no outcome history uses its last update timestamp as a best-effort event date.
- Workspace activation test referrals and their history are excluded from the standard inbox, partner counts, reports, and admin aggregate counts. Admins can inspect test referrals in the separate workspace-scoped test list.

The current analytics endpoint still paginates through all historical referrals, link opens, and status events in the selected workspace. Do not add a fixed date range to these reads yet: the UI permits historical month selection, available months depend on history, and outcome events must retain referral attribution across month boundaries. A safe next optimization is a date-indexed event query (plus a compact month index if needed), validated against an isolated representative staging dataset. Before and after comparison must record Cosmos request charge, end-to-end latency, and 429s for the same history volume. No live or shared development database should be used as that dataset.

## Admin activation test flow

`POST /api/staff/test-referrals` accepts an active `CardCode` and a caller-generated UUID `SubmissionId`. It requires an authenticated workspace Admin, verifies that the resolved card and its active partner/location belong to the selected workspace, and generates synthetic data and `isTest=true` on the server. The referral and initial history are created transactionally in the business partition. The route does not consult or change subscription, intake, or alert settings and never queues an email. The UUID makes retries idempotent. New test creation is rate limited to 10 per admin per hour. `GET /api/staff/test-referrals` lists only the selected workspace's latest 200 test records and signals when the list is truncated. Public referral fields cannot set the marker.

Production deployment, live billing changes, and production intake toggles are outside the scope of this code change. Staging tests must use isolated workspace IDs, cards, and non-customer synthetic data.

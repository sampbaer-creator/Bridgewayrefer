# BridgeWay workspace activation workflow

The owner setup checklist is derived from the authenticated staff APIs. It does not store a second copy of completion state, so it updates when billing, locations, partners, cards, and intake settings change.

## Owner sequence

1. Confirm access through an active or trialing subscription, or an approved billing-exempt pilot. Past-due subscriptions currently count as access because the existing entitlement policy permits them; confirm that policy before live launch.
2. Add an active receiving office or branch.
3. Add an active referring partner.
4. Issue an active card link associated with the intended partner and location. Preview the form, copy the URL, or display its QR code before handing out a physical card.
5. Verify a test referral in isolated staging.
6. Enable intake only after prerequisites are complete.

## Current evidence and limitation

The dashboard loads subscription, offices, partners, cards, business profile, and referrals from existing `/api/staff/*` endpoints. It can confirm active access, location, partner, card link, and live intake. It gives the owner a reason when intake is unavailable, including platform pause, workspace suspension, missing access, location, partner, card, or workspace intake setting.

The current API does not support a dedicated authenticated test-referral operation or a test marker that reporting consistently excludes. The UI therefore leaves test verification incomplete and labels isolated staging as a prerequisite. Do not submit a production referral as a test. Implement the test path before relying on the checklist to activate a production workspace.

## Test-path implementation requirements

- Require an authenticated workspace admin and a valid active card/partner/location association.
- Mark test records on the server; never trust a public request flag to decide whether a referral is test data.
- Write the test referral and initial history transactionally in the workspace partition, with no customer notification.
- Exclude test records from inbox defaults, partner metrics, totals, trends, and exports while allowing admins to inspect them in a separate test view.
- Ensure the test endpoint cannot enable intake or alter subscription state.
- Add tests proving tenant isolation, idempotent repeat submissions, no alert delivery, and report exclusion.

## Release acceptance

For an orthodontic and a trades staging workspace, complete the sequence with different staff and alert recipients. Confirm the card resolves to the correct business, partner, and location; the isolated test appears only in the test view; normal referral reporting excludes it; and real intake remains off until explicit activation. Then verify customer submission, staff assignment, status history, outcome date semantics, and workspace isolation.

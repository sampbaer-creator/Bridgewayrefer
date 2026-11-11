# Bridgewayrefer pilot readiness

Dental specialists are the initial website audience. Businesses use the same workspace and referral workflow.

## Sign-in and custom domain

The API checks the configured Entra tenant and active workspace membership. An application invitation does not create an Entra guest. For a workforce tenant, pilot an invited external user who has redeemed an Entra B2B invitation into that tenant. Evaluate Entra External ID before offering broader self-service access.

Verify HTTPS on bridgewayrefer.com and register its exact /signin-oidc callback in Entra before switching the API public origin. Check an external user's sign-in and authorized workspace update, an existing card link, Stripe return navigation, and the origin check on writes.

## Pilot and follow-up

1. Confirm card pricing, shipping and replacements. Give staff a card request and fulfillment status.
2. Use a test referral on an issued card to check office routing, one saved submission, staff follow-up and SMTP acceptance.
3. Add explicit next-action deadlines, appointment times and contact-attempt history. Check that a future appointment stays out of Overdue and a missed callback appears there.
4. Add server-side inbox filters and continuation tokens. Verify that staff can find and update an unresolved referral beyond the newest 500.
5. Add authorized alert retry and opt-in recovery for missing notifications. Keep SMTP acceptance distinct from inbox delivery.
6. Define trial activation and expiry across billing, workspace access and card fulfillment before offering a trial. Require verified recipient access before exposing partner feedback.

Use Search Console URL Inspection for indexing. Treat link opens as page loads and report monthly activity separately from referral cohort outcomes.

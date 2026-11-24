# Stripe sandbox operations

The public application is temporarily authorized to use the existing Stripe test-mode integration. Test mode requires an explicit `Bridgewayrefer__AllowStripeTestMode=true` setting; the code default stays false.

## Current catalog

- Workspace: $50 USD/month, test Price configured by `Bridgewayrefer__StripePriceId` (or legacy `BridgeWay__StripePriceId`).
- Managed Calling: $400 USD/month, test Price configured by `Bridgewayrefer__ManagedCallingStripePriceId`.
- Test webhook: `https://bridgewayrefer.com/api/stripe/webhook`, with the matching test endpoint signing secret in Azure secret storage.

Use card `4242 4242 4242 4242`, a future expiration, and any three-digit CVC. Invitations are labelled `[TEST]`; the admin and owner screens identify sandbox payments. Access opens from the verified subscription webhook, never from the return URL alone.

## Switch to live billing

1. Finish Stripe account activation and confirm live charges are enabled.
2. Create the live Workspace and Managed Calling Products/Prices at the intended monthly USD amounts. Test IDs cannot be reused in live mode.
3. Create a live webhook endpoint with the lifecycle events handled by the application, and store its signing secret in Azure secret storage.
4. Replace the Stripe key secret, both Price IDs, and webhook signing secret with their matching live-mode values. Set `Bridgewayrefer__AllowStripeTestMode=false` and deploy as one configuration change.
5. Archive sandbox workspaces and issue fresh live onboarding invitations. Workspaces carry `billingLiveMode`, so test-paid workspaces cannot become live entitlements by replacing credentials. Existing test customer/subscription IDs cannot be reused for live customers.
6. Verify live webhook delivery and a real subscription before inviting paying customers.

Never commit Stripe API keys, signing secrets, or invitation tokens. Use a restricted API key with the permissions needed by the integration when configuring live credentials.

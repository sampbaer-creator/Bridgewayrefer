# Bridgeway branded email senders

The application can keep the existing Microsoft mailbox for administrative alerts and send branded customer messages through Cloudflare Email Sending:

- Walkthrough acknowledgments: `demo@bridgewayrefer.com`
- Customer onboarding links: `hello@bridgewayrefer.com`
- Support address shown on the Contact page: `support@bridgewayrefer.com`

## Cloudflare setup

1. In Cloudflare, open **Compute > Email Service > Email Sending** and onboard `bridgewayrefer.com`. Email Sending uses records on `cf-bounce` and has separate settings from Email Routing, so it can coexist with existing inbound routing rules.
2. Keep or add Email Routing rules for `demo`, `hello`, and `support`, each forwarding to the inbox where Bridgeway messages are handled. Sending does not create inboxes.
3. Create a Cloudflare API token limited to the **Email Sending: Write** permission. Do not use a Global API Key.
4. Add the account ID and token to the API Container App as secrets/configuration:

   - `Bridgewayrefer__CloudflareEmailSendingAccountId`
   - `Bridgewayrefer__CloudflareEmailSendingApiToken` (secret)

The app only sends through Cloudflare when both values are present and the From address exactly matches one of the three configured sender addresses. Until the token is configured, walkthrough receipts and onboarding links continue using the existing Microsoft sender and reply behavior.

Cloudflare Email Sending is currently in beta. Its Free plan can send only to verified destination addresses; arbitrary recipients require Workers Paid. Verify the account's plan and sending limits before enabling the provider for customer emails.

## Replies

The existing walkthrough notification sets Reply-To to the requester so Bridgeway can respond directly. Messages sent from `demo`, `hello`, or `support` can receive replies only if those addresses are routed to a mailbox. Email Routing forwards inbound messages; staff replies sent manually from Outlook will still show the Outlook address unless Outlook is also configured with a sender that is authorized to send as the custom address.

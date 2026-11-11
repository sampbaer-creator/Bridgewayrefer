# Bridgewayrefer

Referral follow-up for businesses, from a partner's NFC card to a completed next step.

> **Target public site:** [bridgewayrefer.com](https://bridgewayrefer.com/)

## Table of Contents

- [About the Project](#about-the-project)
  - [Built With](#built-with)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)
- [Acknowledgments](#acknowledgments)

## About The Project

Bridgewayrefer helps a business see where referrals come from and follow up with each customer. A partner shares an NFC card or QR code; the customer opens a short referral form; the request goes to the business's private dashboard with the referring partner and receiving office attached.

Every business uses the same workflow and dashboard, whatever its industry. Businesses can manage partners, offices, NFC links, staff access, referral status, and subscription settings in one place.

### Built With

- ASP.NET Core 10 and C# for the API
- Next.js 16 and React 19 for the website and dashboards
- Azure Cosmos DB for business and referral data
- Microsoft Entra for sign-in and access control
- Stripe for subscriptions

## Getting Started

Use these steps to run Bridgewayrefer locally. Local development connects to the configured development Cosmos DB; it does not create a database automatically.

### Prerequisites

- .NET 10 SDK
- Node.js 24 and npm
- Azure CLI, signed in to an account with access to the development Cosmos DB
- A Microsoft Entra app registration for sign-in

Stripe settings are needed to test signup and checkout. SMTP settings are needed to test referral email alerts.

### Installation

1. Clone the repository:

   ```powershell
   git clone https://github.com/sampbaer-creator/BridgeWay.git
   cd BridgeWay
   ```

2. Sign in to Azure and install the web dependencies:

   ```powershell
   az login
   npm.cmd ci --prefix src/bridgeway-web
   ```

3. Add your Entra app settings and your Entra user Object ID as the platform admin. These values are stored in .NET user secrets, not in the repository:

   ```powershell
   dotnet user-secrets set "Bridgewayrefer:TenantId" "YOUR-TENANT-ID" --project src/BridgeWay.Api
   dotnet user-secrets set "Bridgewayrefer:ClientId" "YOUR-APP-ID" --project src/BridgeWay.Api
   dotnet user-secrets set "Bridgewayrefer:ClientSecret" "YOUR-APP-SECRET" --project src/BridgeWay.Api
   dotnet user-secrets set "Bridgewayrefer:PlatformAdminObjectIds:0" "YOUR-ENTRA-USER-OBJECT-ID" --project src/BridgeWay.Api
   ```

4. Start the API and website:

   ```powershell
   ./scripts/Start-Local.ps1
   ```

5. Open [http://localhost:3000](http://localhost:3000). Use `/admin` to create a business and issue a card link. Open the generated link in a browser to preview the customer form; no physical NFC card is needed.

## Usage

### Platform admin

Sign in at `/admin` with an approved Entra account. Create a business, invite its administrator, and issue links for a partner and receiving office. Each link can be copied or shown as a QR code and written to an NFC card.

### Business admin and staff

Business staff sign in at `/staff` using an invited email address. They review incoming referrals, follow up, and update statuses. Business admins can also manage their workspace settings, partners, offices, cards, team access, and billing.

### Customer referral

When a customer opens an active card link, the form displays that business's information. A submitted request appears in that business's private inbox, attributed to the link's partner and office. Opening the link lets you preview the form; submitting it creates a real referral record, so use test details when checking the workflow.

### When referral intake is open

All of these conditions must be met before a form accepts requests:

- The platform setting `Bridgewayrefer__AcceptReferrals` is `true`.
- Intake is enabled in the business profile.
- The business is not suspended.
- The subscription is active, trialing, or past due, or the platform admin marked the business billing-exempt.

New signup workspaces start with intake off. Email alerts require SMTP configuration; alert emails contain a dashboard link, not patient details.

### Production settings

Configure settings in the Azure API Container App, using Azure secrets for credentials. The intended public origin is `https://bridgewayrefer.com`; verify its DNS, custom-domain binding, and HTTPS certificate before launch. The Entra app's redirect URI and Stripe webhook must use that same origin.

The main settings are `Bridgewayrefer__PublicOrigin`, `Bridgewayrefer__AcceptReferrals`, `Bridgewayrefer__TenantId`, `Bridgewayrefer__ClientId`, `Bridgewayrefer__ClientSecret`, `Bridgewayrefer__PlatformAdminObjectIds__0`, `Cosmos__Endpoint`, `Cosmos__Database`, Stripe settings, and optional SMTP settings. The web app uses `BRIDGEWAYREFER_API_ORIGIN` for its API origin. Keep credentials in Azure secrets and make sure the Entra redirect URI and Stripe webhook use the public origin above. Existing `BridgeWay__...`, `BRIDGEWAY_API_ORIGIN`, and `X-BridgeWay-Business` names remain accepted by the API for compatibility; the `Bridgewayrefer` names take precedence when both config prefixes are present.

Stripe uses `Bridgewayrefer__StripePriceId` for the $50/month Referral Workspace. Managed Calling is an optional $400/month plan that includes the workspace; configure its active recurring monthly Stripe Price ID as `Bridgewayrefer__ManagedCallingStripePriceId`. The API checks that each selected Price is active, monthly, USD, at the expected amount, and in the same Stripe mode as its key. Until the Managed Calling Price ID is configured, its signup option stays unavailable. Store the ID as app configuration and keep Stripe keys and webhook secrets in Azure secrets.

## Roadmap

- Finish and verify the `bridgewayrefer.com` custom domain, HTTPS binding, and Microsoft sign-in redirect.
- Configure live Stripe checkout and webhook events before enabling public signup.
- Configure SMTP and test referral alerts before relying on email notifications.
- Keep improving the shared referral workflow and dashboard for businesses across industries.

## Contributing

The repository is private. For changes, create a feature branch, make a focused commit, and open a pull request for review. Do not commit secrets, customer records, or production exports.

## License

No license has been added to this repository yet. All rights are reserved unless the repository owner publishes a license.

## Contact

Open an issue or pull request in the [Bridgewayrefer repository](https://github.com/sampbaer-creator/BridgeWay).

## Acknowledgments

- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) for the README structure.
- The Bridgewayrefer Figma references in `UiDesign` for the product screens and workflow.


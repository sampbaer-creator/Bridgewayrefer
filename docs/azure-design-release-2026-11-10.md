# Azure design release - 2026-11-10

- Web application source: `f8e1e71` on `main`, including bundled Lato regular and bold fonts and their license.
- Web image: `bridgewayacr3560.azurecr.io/bridgeway-web:lato-20261110`.
- Web revision: `bridgeway-web--lato-1110`.
- API image: `bridgewayacr3560.azurecr.io/bridgeway-api:figma-20261110`.
- API revision: `bridgeway-api--figma-ready-1110`.
- API traffic explicitly targets the healthy API revision. The earlier failed `figma-20261110` revision was deactivated.
- Cosmos database explicitly configured as the existing `bridgeway-dev` database. No data migration was performed.
- Cookie protection key: `https://bridgewaykeys3560.vault.azure.net/keys/cookie-protection`. API managed identity has get, wrapKey, and unwrapKey permissions.
- Previous healthy API revision: `bridgeway-api--0000005`.
- Previous web revision: `bridgeway-web--figma-final-1110`.

## Verification

- Nine customer entry and report race browser tests passed after obsolete theme removal.
- GitHub CI verified the application builds and browser checks.
- Public homepage and signup returned HTTP 200.
- `/health/cosmos` returned `connected`; `/api/signup` reported enabled.
- `/staff/login` returned a redirect to Microsoft.
- Local browser confirmed bundled Lato loaded and the homepage fit a 390px viewport before the font switch.
- Authenticated production workflows and a real Stripe payment were not exercised by these checks.

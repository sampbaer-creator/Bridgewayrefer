# Azure pilot deployment — 2026-11-09

## Deployed source

- Merged `main` commit: `75edcfa000b5d2eb5b30a65c652419170fc2f6d0` (PR #4).
- Latest deployed application source SHA: `b44007b722d0c0ccf27d7a772954114d1bb2bc2f`.
- API image: `bridgewayacr3560.azurecr.io/bridgeway-api:b44007b722d0c0ccf27d7a772954114d1bb2bc2f`.
- Web image: `bridgewayacr3560.azurecr.io/bridgeway-web:b44007b722d0c0ccf27d7a772954114d1bb2bc2f`, built with the private API origin `http://bridgeway-api.internal.redbeach-9c4157d2.westus2.azurecontainerapps.io`.
- Active API revision: `bridgeway-api--b44007b`.
- Active web revision: `bridgeway-web--b44007b`.
- Public origin: `https://bridgeway-web.redbeach-9c4157d2.westus2.azurecontainerapps.io`.

## Rollback points

- Immediately previous API revision: `bridgeway-api--0000004` (merged image with Entra configuration).
- Immediately previous web revision: `bridgeway-web--plain9f4faf0` (plain UI image).
- Original pre-deployment API revision: `bridgeway-api--0000003`, image tag `deploy-2026-11-09`, manifest `sha256:e7f5c4b77ccfb0cbe1e99448aa175d7d3889196d24248bef9560e918c03339e6`.
- Original pre-deployment web revision: `bridgeway-web--0000001`, image tag `deploy-2026-11-09`, manifest `sha256:a9d710a698456c8ab172846b85fc83d2aea2cf93d122c23f4aff8b1bfea78603`.

Revisions remain available for rollback using Azure CLI:

```powershell
az containerapp revision activate -g BridgeWay -n bridgeway-api --revision bridgeway-api--0000004
az containerapp revision activate -g BridgeWay -n bridgeway-web --revision bridgeway-web--plain9f4faf0
```

To restore the original pre-deployment images, update each app to its recorded tag:

```powershell
az containerapp update -g BridgeWay -n bridgeway-api --image bridgewayacr3560.azurecr.io/bridgeway-api:deploy-2026-11-09
az containerapp update -g BridgeWay -n bridgeway-web --image bridgewayacr3560.azurecr.io/bridgeway-web:deploy-2026-11-09
```

## Entra configuration

The single-tenant application registration has callback URI
`https://bridgeway-web.redbeach-9c4157d2.westus2.azurecontainerapps.io/signin-oidc`.
The client credential is held in the API Container App secret `entra-client-secret` and is referenced by the API environment. Platform admin and staff access are restricted to the signed-in user's configured Entra object ID. Intake and customer signup remain disabled until Stripe test credentials and a test Price are configured.

## Verification

- Public homepage returned HTTP 200 with Sign in and Sign up links; `/signup` returned HTTP 200.
- `/health/cosmos` returned HTTP 200 with `{"status":"connected"}`.
- `/api/admin/businesses` without authentication returned HTTP 401.
- `/api/public/config` reported `accepting:false`; `/api/signup` reported `enabled:false` while no Stripe sandbox credentials are configured.
- `/staff/login` redirected to Microsoft with the exact HTTPS origin and `/signin-oidc` callback.
- Local verification: 28 C# tests passed, 1 Cosmos integration test skipped; Next production build passed; browser suite passed 10/10 against the local API and frontend.
- Hosted interactive sign-in, Stripe checkout/webhook, hosted card issuance, and hosted referral submission still require manual credentials/session setup and are not claimed as verified.

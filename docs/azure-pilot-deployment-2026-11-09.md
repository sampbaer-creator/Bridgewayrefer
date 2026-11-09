# Azure pilot deployment — 2026-11-09

## Deployed source

- Merged `main` commit: `75edcfa000b5d2eb5b30a65c652419170fc2f6d0` (PR #4).
- API image: `bridgewayacr3560.azurecr.io/bridgeway-api:75edcfa000b5d2eb5b30a65c652419170fc2f6d0`.
- Web image: `bridgewayacr3560.azurecr.io/bridgeway-web:75edcfa000b5d2eb5b30a65c652419170fc2f6d0`, built with the private API origin `http://bridgeway-api.internal.redbeach-9c4157d2.westus2.azurecontainerapps.io`.
- Current API revision after Entra configuration: `bridgeway-api--0000004`.
- Current web revision: `bridgeway-web--main75edcfa`.
- Public origin: `https://bridgeway-web.redbeach-9c4157d2.westus2.azurecontainerapps.io`.

## Revisions before deployment

- API: `bridgeway-api--0000003`, image tag `deploy-2026-11-09`, manifest `sha256:e7f5c4b77ccfb0cbe1e99448aa175d7d3889196d24248bef9560e918c03339e6`.
- Web: `bridgeway-web--0000001`, image tag `deploy-2026-11-09`, manifest `sha256:a9d710a698456c8ab172846b85fc83d2aea2cf93d122c23f4aff8b1bfea78603`.
- API revision `bridgeway-api--main75edcfa` is the pre-auth-config version of the merged image.

To restore the pre-deployment images, update each app to its recorded tag:

```powershell
az containerapp update -g BridgeWay -n bridgeway-api --image bridgewayacr3560.azurecr.io/bridgeway-api:deploy-2026-11-09
az containerapp update -g BridgeWay -n bridgeway-web --image bridgewayacr3560.azurecr.io/bridgeway-web:deploy-2026-11-09
```

## Entra configuration

The single-tenant application registration has callback URI
`https://bridgeway-web.redbeach-9c4157d2.westus2.azurecontainerapps.io/signin-oidc`.
The client credential is held in the API Container App secret `entra-client-secret` and is referenced by the API environment. Intake and customer signup remain disabled until a Stripe test Price and webhook secret are configured.

# Azure DevOps deployment setup

The pipeline is intentionally manual-only (trigger: none, pr: none). It validates the existing .NET API tests and Next.js build, builds both existing Dockerfiles from repository-root context, pushes immutable commit/build tags, then invokes scripts/deploy-production.sh.

Required Azure DevOps configuration:

1. In the Azure DevOps project, create an Azure Resource Manager service connection named bridgeway-azure using Workload identity federation. Scope it to subscription 91a3efb2-bb44-43ae-872c-5b15b81689cd, resource group BridgeWay.
2. Grant its service principal AcrPush on bridgewayacr3560 plus Contributor on bridgeway-api and bridgeway-web (or an equivalent custom role).
3. Connect sampbaer-creator/Bridgewayrefer through the Azure DevOps GitHub authorization flow. Never put credentials or tokens in pipeline variables.
4. Create a pipeline from this repository and select azure-pipelines.yml. Keep the first run manual.
5. Authorize the BridgeWay-production environment before the first production run.

The rollout preserves existing Container App environment variables, secret references, managed identities, revision mode, and custom-domain configuration. It uses /health/cosmos and the public-site root health checks.

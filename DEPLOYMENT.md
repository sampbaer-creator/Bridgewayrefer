# BridgeWay deployment

Codex runs the reviewed deployment workflow from this repository using the existing Azure Container Apps, Azure Container Registry, and Cosmos DB. GitHub remains the source control and review system.

## PowerShell command (optional)

From the repository root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Install-DeployCommand.ps1
```

The installer adds or updates only its marked BridgeWay block in your PowerShell profile. Restart VS Code or open a new terminal afterward. Keep `scripts/deploy.ps1` in this repository; the profile function points to this checkout. When you type `deploy` in Codex chat, Codex handles Git review/PR gating before it invokes the script; it does not rely on this PowerShell command.

## Commands

```powershell
deploy          # Test and deploy frontend and API
deploy web      # Deploy frontend only
deploy api      # Deploy API only
deploy status   # Show revisions, traffic, and public health checks
deploy rollback # Inspect healthy revisions and confirm a rollback
deploy help     # Show command help
```

The script uses the existing `src/bridgeway-web/Dockerfile` and `src/BridgeWay.Api/Dockerfile` with the repository root as context, then runs `az acr build` to build images remotely in Azure and push them to the existing ACR. This does not require Docker or Docker Desktop locally. It verifies the selected Azure subscription/resources and public website/API baseline before building, runs the selected application tests (API test suite and/or frontend build plus Playwright browser tests), confirms each image exists in ACR, and stages a new Container Apps revision. A failed baseline health check stops before builds or app changes. It waits for healthy revisions and checks candidate/public endpoints before considering deployment successful. It will not deploy an image that failed build or registry validation.

Azure source build validation was performed using `az acr build --no-push` against both existing Dockerfiles and the repository-root context. Both ACR build runs completed successfully (API run `cc1h`; frontend run `cc1j`). The registry had no persistent ACR task definitions, but on-demand ACR builds are available. The test builds created no image tags and did not update Container Apps. ACR charges for task compute per CPU-second; registry storage/other Azure usage remains subject to the existing pricing plan.

`az containerapp up --source` is not used by the deployment workflow. Microsoft labels it Preview; the local source behavior can create resources when not given explicit existing-resource arguments, and the current Dockerfiles rely on repository-root paths while living under `src/`. The source build option also has environment-variable replacement behavior to guard against. The tested ACR build followed by the existing staged `az containerapp update` flow avoids that ambiguity and preserves app configuration.

The full Codex `deploy` workflow reviews and tests changes, commits/pushes the feature branch, follows the existing PR process, and waits for explicit approval before merge. After the approved PR is merged, Codex safely fast-forwards local `main`, then invokes this script. It never force-pushes, discards local changes, or merges an unapproved PR. The script itself never stages, commits, or pushes changes and requires clean `main` current with `origin/main`.

For a first run, sign in with `az login` and select subscription `91a3efb2-bb44-43ae-872c-5b15b81689cd`. Azure CLI, .NET SDK, Node.js, npm, and Git must be on PATH. No Docker installation is required. No secret values are printed or supplied by the deployment script; Container Apps keep their existing secret references and environment configuration.

## Rollback

The script keeps old revisions and snapshots serving traffic. If a post-promotion health check fails, it attempts to restore the previous traffic weights automatically. For manual rollback, first run `deploy status`, then set 100% traffic to the last known healthy revision:

```powershell
az containerapp ingress traffic set --name bridgeway-web --resource-group BridgeWay --revision-weight bridgeway-web--REVISION=100
az containerapp ingress traffic set --name bridgeway-api --resource-group BridgeWay --revision-weight bridgeway-api--REVISION=100
```

Replace each `REVISION` with the revision shown healthy in `deploy status`. Do not deactivate old revisions until the replacement is verified.

`deploy rollback` lists healthy revisions and asks you to select an app, revision, and type `ROLLBACK` before changing traffic.

## GitHub and Azure

Continue to edit and review code through GitHub. Typing `deploy` in Codex starts the review, test, commit, push, PR approval, merge, local-main update, ACR remote build, and Azure deployment sequence. `.github/workflows/deploy-production.yml` has an empty trigger map and a disabled deploy-job condition, so pushes will not auto-deploy. `verify.yml` remains available for manual dispatch only; pushes and pull requests do not run GitHub Actions. A manual dispatch still consumes GitHub Actions minutes. GitHub CLI could not inspect this private repository's branch protection settings on its current plan; no branch protection settings were changed.

## No-Docker alternatives and costs

Azure Pipelines can build the same Dockerfiles on Microsoft-hosted agents without Docker Desktop on your machine. Microsoft currently lists one free hosted parallel job with 1,800 minutes/month; paid parallel capacity is listed at $40/month per extra Microsoft-hosted job. One self-hosted parallel job is free, but requires a running agent machine and its compute/network costs; additional self-hosted parallel capacity is listed at $15/month. Azure Pipelines requires an Azure DevOps organization and service connections to GitHub and Azure. ACR remote builds are already working for this subscription, so no separate pipeline or additional infrastructure is needed for deployment. See [Azure DevOps pricing](https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/) and [ACR pricing](https://azure.microsoft.com/en-us/pricing/details/container-registry/) for current rates.

## Charges

Remote ACR builds avoid local Docker and GitHub Actions minutes. ACR build task compute is billed per CPU-second; image storage, data transfer, Container Apps compute/replicas, logs, and Cosmos DB usage may also incur charges. The registry has no persistent ACR task definitions, but its on-demand remote builds are available. Review Azure cost analysis for your subscription and monitor Container Apps replica settings.

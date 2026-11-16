# BridgeWay project instructions

## Deployment trigger

When the user's message is exactly `deploy`, perform the repository deployment workflow defined below without asking for confirmation during a routine successful deployment. Do not deploy in response to a message that merely discusses deployment.

### Before changing Git or Azure

1. Inspect the current branch, status, staged and unstaged diffs, and untracked files. Review the intended changes for correctness and credentials. Treat auth-state files, `.env*`, private keys, tokens, and credential exports as sensitive: do not open values into chat or stage them. Inspect names and metadata, and stop if it is unclear whether an untracked file contains a secret. Never modify untracked files unless the user asks.
2. Run applicable checks: API test suite (`dotnet test tests/BridgeWay.Api.Tests --configuration Release`) and/or frontend checks (`npm ci`, `npm run build`, and `npx playwright test`) from `src/bridgeway-web`. Stop on a critical failure.
3. For a feature branch, push the reviewed changes to that branch and create or update its pull request using the repository's established process. Do not merge a PR without explicit user approval. Wait until an approved PR is merged to `main` before deployment. If there is no PR mechanism or the intended changes are unclear, stop and explain.
4. After approval and merge, fetch `origin`, preserve any local changes/commits, and fast-forward local `main` only when safe. Never reset, force-push, discard, or overwrite remote changes. If local `main` diverges, stop and ask for resolution.
5. Once approved changes are on current `main`, use the requested deploy target. The Azure script builds/pushes selected images and deploys them. It does not commit or push. Normal `deploy` runs the complete Git-to-Azure workflow from Codex; do not stop after invoking the script if GitHub approval/merge work remains.

### Deployment safety

- Use Azure CLI and the existing ACR and Container Apps. Build remotely with `az acr build`; do not use Docker Desktop, GitHub Actions, create infrastructure, modify Cosmos records, or change authentication, billing, referrals, domains, secrets, or unrelated environment settings.
- Keep the existing Dockerfiles and repository-root build context. Validate each image in ACR before updating Container Apps.
- Stage a new revision, wait for healthy state, check candidate and production health, and preserve previous traffic weights for rollback. Do not claim success unless public checks and traffic checks pass.
- Never commit credentials or expose secret values in logs.
- Use `az containerapp update` only to change the image on the existing app, preserving existing settings. Do not use `az containerapp up --source` for production: it is preview behavior, source context rules conflict with the existing repository-root Dockerfile contexts, and the command may change app configuration or create resources.
- `deploy rollback` is a separate interactive operation: inspect healthy revisions and ask the user to select and confirm a revision before routing traffic.

## Natural language commands

- `deploy`: review changes, test, commit and push the feature branch, follow the existing PR process, wait for explicit merge approval, then update local `main`, build/push both images, deploy, and verify production.
- `deploy web`: same end-to-end Git/PR process, then build and deploy frontend only.
- `deploy api`: same end-to-end Git/PR process, then build and deploy backend only.
- `deploy status`: inspect current Azure revisions, health, traffic, and public endpoints without changing production.
- `deploy rollback`: inspect prior healthy revisions and request explicit confirmation before changing traffic.

Reusable Azure deployment logic is in `scripts/deploy.ps1`; it uses ACR's on-demand remote build service and does not need a local container engine. Deployment architecture and setup details are in `DEPLOYMENT.md`. `.github/workflows/deploy-production.yml` has no active trigger and its deploy job is disabled. `verify.yml` is manual-dispatch only to avoid consuming GitHub Actions minutes on push/PR; a manual run still consumes Actions minutes. Do not rely on GitHub Actions for this workflow.

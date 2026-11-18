# Agent attribution and repository audit

Audit date: 2026-11-18. Repository: `sampbaer-creator/Bridgewayrefer`; default branch: `main`.

## Published conventions versus verified identities

OpenAI published `Codex <noreply@openai.com>` as its default commit co-author convention in [official Codex source commit 8f5d68f9d2](https://github.com/openai/codex/commit/8f5d68f9d2). That implementation gates automatic attribution behind `features.codex_git_commit`; the current main schema inspected in this audit did not expose `commit_attribution`. We therefore use AGENTS.md instructions to add the trailer explicitly rather than install a potentially unsupported client setting. Client versions differ; inspect the actual message for duplicates.

Anthropic's [official attribution reference](https://code.claude.com/docs/en/settings-reference#attributioncommit) documents `noreply@anthropic.com`, normally paired with the model name or the generic name Claude when the exact version is unavailable. The project explicitly uses the generic Claude name to avoid asserting a model version. [Shared project settings](https://code.claude.com/docs/en/settings) load from `.claude/settings.json`; start Claude Code at the repository root and inspect `/status` for active settings. Local, command-line, and managed settings can override project settings.

These are verified vendor-published conventions. This audit did not establish that either email belongs to a particular verified GitHub account, nor find an authorized standalone Git commit author identity for either agent. Do not substitute a guessed username, bot account, GitHub App identity, or vendor email as the primary author. A GitHub App's ability to open a PR does not authorize impersonating its commit identity. A commit signature's Verified badge is a separate concept from author email/account association.

## What credit works

The commit message records which tool assisted. GitHub supports [co-author trailers](https://docs.github.com/en/pull-requests/how-tos/commit-changes/creating-a-commit-with-multiple-authors), but account-linked credit requires the email to be associated with that account. A PR description is disclosure, not a commit contribution. Branch naming and PR authorship do not change commit author identity.

Do not promise separate Codex or Claude entries in the repository Contributors section. GitHub's [contributors documentation](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-projects-contributors) requires account-associated author email and commits on the default branch; the graph shows the top 100 and excludes merge and empty commits. Co-author display/profile contribution support is not a guarantee of inclusion in every repository contributor display. Private repository insights also depend on the GitHub plan, and statistics can lag.

For dependable separate author entries, each agent would need an authorized, clearly labeled automation account or supported vendor integration with a confirmed account-associated commit email, legitimate credentials and repository permission, and genuine future non-empty commits authored by that identity that eventually reach main through an explicitly approved merge. An owner-controlled automation account must be described as owner-controlled, not an official OpenAI or Anthropic account. Verify its email through GitHub (or use its exact GitHub-issued noreply address); never try to claim vendor-owned email addresses. Only after that setup and explicit authorization should future sessions use that identity. GitHub display limits still apply. No existing commits need to be changed, and this configuration changes no author identities.

## Inspected state

- Effective Git identity inherited from the user's global configuration: `sampbaer-creator <sampbaer@gmail.com>`. No local author override or custom hooks path was returned. GitHub maps the inspected main commit's author email to `sampbaer-creator`; this is observable account association, not an assertion that this audit could inspect private email-verification settings. Identity configuration was left unchanged.
- The initial working directory was on `feature/referral-inbox-workflow` with unrelated edits. This task uses a separate worktree and `codex/contributor-attribution` based on freshly fetched main (`6b9f5fa` at creation).
- The tracked instruction inventory contained only `src/bridgeway-web/AGENTS.md`, with Next.js documentation requirements. It was retained. Root instructions now cover both agents, and CLAUDE.md imports AGENTS.md.
- `.github/workflows/verify.yml` runs API tests, the web build, and Playwright on PRs targeting main, plus manual dispatch. It was retained unchanged.
- `.github/workflows/deploy-production.yml` is manual-only, requires main and its latest SHA, serializes production deployments without cancellation, uses Azure OIDC, builds images, and calls the deployment script. Workflow and deployment script were retained unchanged by this task.
- Repository metadata reports private, main as default, and admin permission for the authenticated owner. Both branch-protection and ruleset inspection endpoints returned HTTP 403 with an upgrade-or-public-repository message. This does not prove protection is absent; effective protection could not be verified. No settings were changed. Enforceable protection may require upgrading the private repository's plan; then the owner can require PR reviews and successful `api` and `web` checks and restrict bypasses. Instructions alone do not enforce those controls.

No history rewriting, force push, merge, deployment, account creation, or global Git configuration changes are part of this task.

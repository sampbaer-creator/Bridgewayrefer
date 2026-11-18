# Repository rules for coding agents

These rules apply to Codex, Claude Code, and other coding agents throughout this repository. Read applicable nested instructions as well, including `src/bridgeway-web/AGENTS.md` for web changes.

## Branches and delivery

- For every task, fetch `origin main` and create a dedicated feature branch from the freshly fetched `origin/main`, for example `codex/<task>` or `claude/<task>`. Never commit directly to main or reuse another task's branch.
- Inspect status before editing. Preserve unrelated edits and commits. If the checkout is dirty or another task is active, use a separate worktree based on origin/main; do not stash, reset, or include someone else's work.
- Implement the requested changes, run appropriate checks, and review the complete diff and staged diff before committing. Stage only task files. Report test failures and checks that could not run accurately.
- For API changes, run `dotnet test tests/BridgeWay.Api.Tests --configuration Release`. For web changes, run `npm ci`, `npm run build`, and applicable Playwright tests from `src/bridgeway-web`, following `.github/workflows/verify.yml`. For documentation-only changes, check links, instructions, whitespace, and any configuration syntax; application builds are unnecessary.
- When publishing is authorized by the task or an existing user instruction, push the task branch normally and create a pull request explicitly targeting `main`. Include the problem, resulting behavior, validation, limitations, and truthful agent attribution. Otherwise finish with the reviewed local changes and report that publishing remains pending.
- Never rewrite existing history (including amend or rebase), force push, merge a pull request, enable auto-merge, or deploy without explicit user approval for that action.
- Preserve the existing manual Azure deployment process: `.github/workflows/deploy-production.yml` is triggered only by `workflow_dispatch`, checks main and its latest SHA, and invokes `scripts/deploy-production.sh`. Do not dispatch it, add automatic deployment triggers, or change deployment behavior as part of routine coding tasks.

## Truthful attribution

- Inspect effective `git config --show-origin` identity and the resulting author/committer before committing. Preserve the configured authorized human identity for work performed on their behalf; distinguish AI assistance in the commit message. Do not invent an AI author, override author/committer to impersonate an account, or claim the human wrote unaided code.
- For Codex-assisted commits, add exactly one `Co-authored-by: Codex <noreply@openai.com>` trailer, separated from the body by a blank line. This is a vendor-published attribution convention, not proof of a verified GitHub account. Add it explicitly when the client does not; avoid duplicates.
- For Claude-assisted commits, use the documented Claude Code trailer with `noreply@anthropic.com`; the shared settings use `Co-authored-by: Claude <noreply@anthropic.com>`. Never guess a model version or an account-specific noreply address.
- Attribute only agents that actually contributed to that commit. Never add both agents automatically. For other co-authors use only their supplied, verified account-associated email with permission.
- Inspect the final commit message and author before pushing. A trailer records assistance; it does not guarantee account linkage, a Contributors entry, or a cryptographic Verified badge. Preserve meaningful attribution if a later approved merge squashes commits.
- See `docs/agent-attribution.md` for verified sources, account setup requirements, and the settings audit. These instructions express policy; they are not server-enforced branch protection.

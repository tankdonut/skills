# tankdonut/skills

Personal agent skills, installed with the [`skills`](https://github.com/vercel-labs/skills) CLI.

## Installing

Install **all** skills from this repo:

```bash
skills add tankdonut/skills --all
```

Install a **specific** skill:

```bash
skills add tankdonut/skills --skill update-opencode-plugins
```

Preview available skills without installing:

```bash
skills add tankdonut/skills --list
```

Scope:

- `-g` / `--global` → user-level (`~/.agents/skills/`).
- Default → current project.

Update after this repo changes:

```bash
skills update
```

## Bootstrapping another project

The [`bootstrap-skills`](skills/bootstrap-skills/) skill maps
another repository's traits — languages, CI, git workflow, tooling — to
skills from this repo plus vetted community sources, then installs them
project-scoped: a committable `skills-lock.json` at the repo root,
`.agents/` gitignored. Install it globally, then run it inside the target
project:

```bash
skills add tankdonut/skills --skill bootstrap-skills -g -y
```

Teammates rebuild their local copy after cloning:

```bash
skills experimental_install
```

## Restoring the global set

`scripts/global-skills.json` records the full global (`~/.agents/skills/`)
skill set. After a machine or container rebuild:

```bash
git clone https://github.com/tankdonut/skills.git && cd skills
node scripts/restore-skills.mjs
```

The script installs the `skills` CLI if missing, then replays every source
for OpenCode by default. Pass `--agent <name>` to target another agent, or
`--agent '*'` for every detected agent.
Keep the JSON in sync with `skills ls -g` when adding or removing globals.

## Skills

| Skill | Purpose |
|-------|---------|
| [`bootstrap-skills`](skills/bootstrap-skills/) | Set up project-scoped agent skills in another repository — sub-agent axiom scan (languages, CI, git workflow, tooling) mapped to tankdonut/skills plus vetted community skills via find-skills, installed from the GitHub source only into a committable `skills-lock.json` with `.agents/` gitignored, idempotent re-runs, verified via `skills ls --json`, teammates restored through `skills experimental_install`. |
| [`managing-worktrees`](skills/workflow/git-worktrees/) | Isolated feature workspaces via git worktrees under one canonical `.worktrees/` at the main checkout, with portable create / squash-merge (ff opt-in) / remove scripts — gitignore guard, conflict-resolution procedure, tree-identity proof before any branch deletion, and setup/teardown hooks for stack isolation. |
| [`scaffold-repository`](skills/scaffold-repository/) | Scaffold a brand-new repository with the house conventions — Python (uv, hatchling, ruff) or Go (golangci-lint v2, make.sh) — including `.tool-versions`, pre-commit + markdownlint, renovate with 7-day automerge, CI on `tankdonut/github-actions`, and an AGENTS.md skeleton in the `agents-md` template shape (commit attribution included) to fill via the `agents-md` skill. |
| [`update-opencode-plugins`](skills/update-opencode-plugins/) | Bump `name@version` entries in `opencode.json` and the TUI config `tui.json` (user-level `~/.config/opencode/` and project-level `.opencode/`, each with its own plugin array) to the latest npm release, with an optional 7-day cooldown so too-fresh versions are skipped, clear the stale plugin cache at `~/.cache/opencode/packages`, pre-install each bumped version into that cache with a fully controlled `NPM_CONFIG_*` environment (ambient npmrc settings stripped) so opencode loads exactly the pinned version via its cache fast path, and end with a GitHub release-notes briefing of everything between old and new pins. |

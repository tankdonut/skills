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

## Skills

| Skill | Purpose |
|-------|---------|
| [`scaffold-repository`](skills/scaffold-repository/) | Scaffold a brand-new repository with the house conventions — Python (uv, hatchling, ruff) or Go (golangci-lint v2, make.sh) — including `.tool-versions`, pre-commit + markdownlint, renovate with 7-day automerge, CI on `tankdonut/github-actions`, and an AGENTS.md skeleton to fill. |
| [`update-opencode-plugins`](skills/update-opencode-plugins/) | Bump `name@version` entries in `opencode.json` to the latest npm release, with an optional 7-day cooldown so too-fresh versions are skipped, and clear the stale plugin cache at `~/.cache/opencode/packages` so opencode never falls back to an older cached version. |

---
name: bootstrap-skills
license: MIT
description: Use when setting up or refreshing project-scoped agent skills in a repository — bootstrapping tankdonut/skills into another project, mapping detected project traits to skills, generating a committable skills-lock.json, or restoring teammate skills via skills experimental_install.
---

# Bootstrap Skills

## Overview

Installs the right agent skills into the CURRENT project from
`tankdonut/skills` plus vetted community sources, leaving a committable
`skills-lock.json` at the repo root with `.agents/` gitignored. Teammates and
CI rebuild their local copy with `skills experimental_install`.

Split of concerns: the agent owns judgment (axiom detection, skill selection,
user confirmation); the zero-dependency helper `bootstrap.mjs` (beside this
file) owns the mechanics — idempotent install, gitignore hygiene,
verification, and the report.

## When to Use

- "Bootstrap / set up / add skills to this project or repo"
- Onboarding an existing repository to agent skills
- Expanding or refreshing a previously bootstrapped project (re-runs skip
  what is already installed)

Do NOT use for: global (`~/.agents/skills/`) installs — that personal set is
managed by `scripts/restore-skills.mjs` in tankdonut/skills; brand-new empty
repositories — run `scaffold-repository` first and bootstrap afterward.

## Workflow

1. **Preflight** — confirm a git work tree (`git rev-parse
   --is-inside-work-tree`). If `skills-lock.json` exists, read its `skills`
   keys; list installed skills with `skills ls --json` (fallback:
   `npx --yes skills ls --json`). Existing entries are reported, never
   removed.

2. **Axiom scan (sub-agent)** — dispatch ONE sub-agent (explore-class) with
   the Axiom Scan Brief below; it returns the axiom table only. For tiny
   repos, or harnesses without sub-agents, run the brief inline instead.

3. **Map axioms to skills** — apply the Axiom Map below: house skills first,
   then community defaults. Drop anything already installed. Record any
   prominent axiom the map does not cover.

4. **Cover gaps via find-skills** — for each uncovered axiom: if the
   `find-skills` skill is installed, load it; otherwise run
   `npx --yes skills find <query>` per gap (a query argument makes it
   non-interactive). Quality gate before proposing: 1K+ installs, reputable
   owner, actively maintained repo. Present candidates; never auto-install.

5. **Present the plan** — one line per chosen skill with its triggering
   axiom; community candidates marked as such; already-installed skills
   listed as skipped. Get user confirmation before installing.

6. **Install** — a single helper call from the target project root:

   ```bash
   node <this-skill-dir>/bootstrap.mjs \
     --skills managing-worktrees \
     --community wshobson/agents@github-actions-templates \
     --agent opencode
   ```

   `--agent '*'` targets every detected agent. Add `--dry-run` to preview.
   Never install from a local clone path — the lock records the source
   verbatim and a local path is not portable across machines.

7. **Report and hand off** — summarize the helper output (installed /
   pre-existing / failed). Remind the user to commit `skills-lock.json` and
   the `.gitignore` change, that teammates restore with
   `skills experimental_install`, and that later refreshes run
   `skills update`.

## Axiom Scan Brief

Send this to the sub-agent verbatim, plus the repo root:

```text
Scan this repository and report its engineering axioms. Evidence is
filename- and config-level; do not read implementation code.

Detect:
- Languages (go.mod, package.json, pyproject.toml, Cargo.toml, mix.exs, …)
- Frameworks of note (from dependency manifests)
- Package manager, test runner, linter/formatter
- CI system (.github/workflows/*, .gitlab-ci.yml, …)
- Git workflow signals (branch naming in recent git log, PR templates,
  existing worktrees)
- Agent configs present (opencode.json, .claude/, .cursor/, AGENTS.md,
  CLAUDE.md)
- Docs tooling, containerization (Dockerfile, compose files), pre-commit

Output exactly one markdown table: | Axiom | Evidence |.
No recommendations, no prose.
```

## Axiom Map

| Axiom (signal) | Skill | Source |
|----------------|-------|--------|
| Git repo + multi-commit feature work / parallel branches | `managing-worktrees` | tankdonut/skills |
| `opencode.json` with plugin pins | `update-opencode-plugins` | tankdonut/skills |
| Go (`go.mod`) with perf-sensitive hot paths | `golang-performance` | samber/cc-skills-golang |
| `.github/workflows/*` present | `github-actions-templates` | wshobson/agents |
| No `.pre-commit-config.yaml` | `setup-pre-commit` | mattpocock/skills |
| Missing or stale `AGENTS.md` | `agents-md` | getsentry/skills |
| Repo hosts its own skills (`**/SKILL.md`) | `writing-skills` | obra/superpowers |
| PR-based review flow (PR templates, review culture) | `requesting-code-review` | obra/superpowers |
| Empty or brand-new repository | stop — `scaffold-repository` first | tankdonut/skills |

House skills pass `--skills <names>`; community rows pass
`--community owner/repo@skill` (one spec per skill).

## Behavior Rules

- **GitHub sources only.** The lock records the source verbatim; a local
  clone path produces a non-portable `sourceType: "local"` entry.
- **Project scope only.** Global installs are the user's personal set, not
  this skill's business.
- **Additive and idempotent.** Never remove or downgrade an existing skill;
  re-runs skip what is installed and report it as pre-existing.
- **`.agents/` gitignored, lock committed.** The helper enforces this;
  do not undo it by committing `.agents/`.
- **Default agent `opencode`.** Any other agent, or `'*'`, is the user's
  explicit choice.
- **Community installs are gated**: find-skills quality bar met AND user
  confirmation given.

## Edge Cases

- **Existing lock contains `sourceType: "local"` entries** — warn that those
  entries are machine-specific; leave them untouched; suggest re-adding from
  the GitHub source if the user wants them portable.
- **Not a git work tree** — the helper warns and still writes the lock;
  the gitignore step is pointless there, so prefer running inside the repo.
- **Community skill name collides with a house skill** — the helper keeps the
  house version and warns; do not pass both.
- **No skills CLI and no npx/Node 18+** — the helper fails with the remedy;
  report it and stop.
- **Install or verification failure** — the helper exits 1 naming the missing
  skills; report the failure, fix the cause (network, source typo), re-run.
  Do not blind-retry.
- **User wants everything from tankdonut/skills** — only when they say so
  explicitly; the normal path is axiom-driven selection.

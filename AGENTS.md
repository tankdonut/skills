# Agent Instructions

This repository hosts personal agent skills consumed via the
[`skills`](https://github.com/vercel-labs/skills) CLI. Each skill is a
top-level directory containing a `SKILL.md`.

## Layout

- One skill per directory under `skills/`: `skills/<name>/SKILL.md`.
- Supporting scripts and reference docs live beside the `SKILL.md`.
- No build step, no monorepo tooling — skills are plain files.
- `scripts/` holds repo tooling: `global-skills.json` records the global
  skill set and `restore-skills.mjs` replays it via the skills CLI. Keep the
  JSON in sync with `skills ls -g` when installing or removing globals.

## Commands

| Task | Command |
|------|---------|
| Syntax-check a helper | `node --check <skill>/<script>.mjs` |
| Dry-run a helper | `node <skill>/<script>.mjs --help` |
| Install git hook | `pre-commit install` |
| Run all checks | `pre-commit run --all-files` |

## Skill Authoring Rules

- `SKILL.md` frontmatter MUST include `name` and `description`.
- `name`: lowercase, hyphens only, verb-first.
- `description` starts with "Use when…"; describes **triggers only**, never the workflow.
- Helper scripts: zero external dependencies; must run on Node 18+ or POSIX shell.
- Validate every script with `node --check` and a real dry-run before committing.
- Keep `SKILL.md` token-efficient; move heavy reference into a sibling file.

## Adding a new skill

1. `mkdir skills/<skill-name> && $EDITOR skills/<skill-name>/SKILL.md`
2. Add any helper scripts in the same directory.
3. Add a row to the **Skills** table in `README.md`.
4. Verify: `skills add . --list` (discovery) and `node --check` + `--help` on every helper.
5. Commit. Existing installs pick it up via `skills update`.

## Conventions

- Preserve existing JSON indentation and trailing newlines when editing configs.
- Never commit secrets or hard-coded absolute home paths in skill bodies.

## Commit Attribution

AI commits MUST include:

```text
Co-Authored-By: <agent name and attribution byline>
```

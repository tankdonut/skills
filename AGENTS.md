# Agent Instructions

This repository hosts personal agent skills consumed via the
[`skills`](https://github.com/vercel-labs/skills) CLI. Each skill is a
top-level directory containing a `SKILL.md`.

## Layout

- One skill per directory under `skills/`: `skills/<name>/SKILL.md`.
- Supporting scripts and reference docs live beside the `SKILL.md`.
- No build step, no monorepo tooling — skills are plain files.

## Commands

| Task | Command |
|------|---------|
| Syntax-check a helper | `node --check <skill>/<script>.mjs` |
| Dry-run a helper | `node <skill>/<script>.mjs --help` |
| Install git hook | `pre-commit install` |
| Run all checks | `pre-commit run --all-files` |
| List installed skills | `skills ls` |
| Preview this repo's skills | `skills add tankdonut/skills --list` |
| Test skill discovery (local) | `skills add . --list` |

## Skill Authoring Rules

- `SKILL.md` frontmatter MUST include `name` and `description`.
- `name`: lowercase, hyphens only, verb-first.
- `description` starts with "Use when…"; describes **triggers only**, never the workflow.
- Helper scripts: zero external dependencies; must run on Node 18+ or POSIX shell.
- Validate every script with `node --check` and a real dry-run before committing.
- Keep `SKILL.md` token-efficient; move heavy reference into a sibling file.

## Conventions

- Preserve existing JSON indentation and trailing newlines when editing configs.
- Never commit secrets or hard-coded absolute home paths in skill bodies.
- Locate config files via the constants in `README.md`, never invented paths.

## Commit Attribution

AI commits MUST include:

```text
Co-Authored-By: <agent name and attribution byline>
```

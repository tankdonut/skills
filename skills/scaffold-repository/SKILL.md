---
name: scaffold-repository
license: MIT
description: Use when creating a brand-new repository from scratch — starting a new project, bootstrapping a repo skeleton, or initializing a fresh repository with house conventions (Python/uv or Go, pre-commit, renovate, AGENTS.md, CI).
---

# Scaffold Repository

## Overview

Creates new repositories that match the tankdonut house pattern on day one:
pinned toolchain (`.tool-versions`), pre-commit (ruff / golangci-lint +
markdownlint-cli2), renovate with 7-day automerge, CI on reusable
`tankdonut/github-actions` workflows, and an AGENTS.md in the house shape.

A zero-dependency Node helper (`scaffold.mjs`, beside this file) writes the
deterministic files. The agent owns the judgment content: the interview, the
AGENTS.md and README bodies, dependency choices, and verification.

Two archetypes:

| Archetype | Stack | Mined from |
|-----------|-------|------------|
| `python-uv` | hatchling, src layout, ruff, pytest, uv | telentfy, tools, skills |
| `go` | `github.com/tankdonut/<name>` module, golangci-lint v2, make.sh | trade-agent |

## When to Use

- User says "create / scaffold / start a new repo, project, or repository".
- Bootstrapping a fresh GitHub repository with CI and conventions.

Do NOT use for: retrofitting conventions onto an existing repo, scaffolding
into a non-empty directory, or stacks other than Python/Go (scaffold those by
hand from the nearest tankdonut repo).

## Workflow

1. **Infer** from the request: repo name, archetype (language), one-line
   purpose, target directory. Default target:
   `$HOME/Development/github.com/tankdonut/<name>`. Never invent a name the
   user did not state.

2. **Interview** (one `question` call — only what inference missed):
   - Name, archetype, one-line purpose — only if not already stated.
   - Git/GitHub handling — always ask:
     **Local only** (init + first commit), **GitHub private**, or
     **GitHub public** (`gh repo create tankdonut/<name>`).

3. **Dry-run the helper** and show the user the file list:

   ```bash
   node <this-skill-dir>/scaffold.mjs --dir <target> --archetype <python-uv|go> \
     --name <name> --description "<one-liner>" --dry-run
   ```

   Pass the latest known `--python-version` / `--go-version` if newer than the
   defaults (3.14.2 / 1.26.6); renovate maintains pins after that.

4. **Apply** (same command, drop `--dry-run`). The helper refuses non-empty
   directories.

5. **Fill judgment files** — the scaffold is unfinished without this:
   - `AGENTS.md`: replace every `<!-- TODO -->` with real content — purpose
     paragraph, Structure rows, Where To Look map, Anti-Patterns.
   - `README.md`: expand the stub if the purpose warrants it.
   - Initial dependencies for the project's actual function:
     `uv add <deps>` (then `uv run pytest`) / `go get <deps>`.

6. **Verify** — must be green before the scaffold is done:

   ```bash
   # python-uv
   uv sync && uv run pytest && uv run ruff check . && uv run ruff format --check .
   # go
   go mod tidy && go build ./... && go test -race ./...
   ```

7. **Git/GitHub** per the interview choice:
   - `git init && git add -A && git branch -M main`, first commit message
     `chore: scaffold repository` with the Co-Authored-By trailer.
   - GitHub: `gh repo create tankdonut/<name> --private|--public --source . --push`.
   - Then `pre-commit install` in the new repo.

## Behavior Rules

- **New repos only.** If the target exists and is non-empty: stop, report,
  never merge a scaffold into existing files.
- **No application logic.** Infrastructure and stubs only; the project's real
  code is separate follow-up work.
- **No absolute home paths** in any generated file; `$HOME`-relative at most.
- **Pins are floors.** Use the latest tool versions you know; renovate and the
  pre-commit revs update themselves afterward.
- **Done means:** AGENTS.md has zero remaining TODO markers, the Verify step
  is green, and the git/GitHub choice from step 2 is executed.

## Edge Cases

- **Name collides with an existing local repo** → confirm overwrite intent
  before pointing `--dir` at it; the helper's empty-dir guard is the backstop.
- **GitHub name already taken / gh not authenticated** → fall back to local
  init, report, let the user create the remote later.
- **uv / go missing from the machine** → scaffold anyway, but report that
  verification (step 6) was skipped and must be run before first push.
- **asdf/mise pins not installed** (e.g. `pre-commit 4.6.2`) → install the
  pinned tools (`asdf install` / `mise install`) before `pre-commit install`.
- **User wants a library published to PyPI** → point them at telentfy's
  `uv-dynamic-versioning` + bumpver setup as the upgrade path; the scaffold
  ships a static `0.0.1` deliberately.

## Manual Fallback

If the helper is unavailable, copy the file set from the source repos listed
in the Overview table: `.tool-versions`, `.gitignore`,
`.markdownlint-cli2.yaml`, `.pre-commit-config.yaml`, `renovate.json`,
`.env.example`, `README.md`, `AGENTS.md`,
`.github/workflows/lint-and-test.yaml`, plus the archetype files
(`pyproject.toml` + `src/<pkg>/` + `tests/`, or `go.mod` + `.golangci.yml` +
`cmd/<name>/main.go` + `make.sh`). Prefer the helper — it keeps the set
coherent and refuses non-empty targets.

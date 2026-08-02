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
| [`update-opencode-plugins`](skills/update-opencode-plugins/) | Bump `name@version` entries in `opencode.json` to the latest npm release, with an optional 7-day cooldown so too-fresh versions are skipped. |

## Conventions

- **Layout** — one skill per directory under `skills/`: `skills/<name>/SKILL.md`, with supporting files beside it.
- **Naming** — lowercase, hyphenated, verb-first (e.g. `update-opencode-plugins`).
- **Frontmatter** — `name` + `description` ("Use when…", triggers only, never the workflow).
- **Zero deps** — helpers run on Node 18+ or POSIX shell; no `npm install` needed.
- **Verifiable** — every script passes `node --check` and a dry-run before commit.

## Constants

Shared values referenced across skills in this repo:

| Constant | Value |
|----------|-------|
| OpenCode user config | `~/.config/opencode/opencode.json` |
| OpenCode project config | `$PWD/.opencode/opencode.json` |
| npm registry base | `https://registry.npmjs.org/` |
| Default plugin cooldown | 7 days |

## Adding a new skill

1. `mkdir skills/<skill-name> && $EDITOR skills/<skill-name>/SKILL.md`
2. Add any helper scripts in the same directory.
3. Add a row to **Skills** above.
4. Commit. Existing installs get it via `skills update`.

## Testing a skill

Verify every new or changed skill is installable before pushing.

**Discovery** (no install) — the CLI must see the skill and parse its frontmatter:

```bash
skills add . --list
```

**Full install** into a scratch project — confirm `SKILL.md` and any helpers land:

```bash
mkdir -p /tmp/skill-test && cd /tmp/skill-test
skills add /path/to/this/repo --skill <name> --agent opencode -y
skills ls
find .agents/skills/<name> -type f
```

**Remote** (after push) — install the way users will. This is the real acceptance test:

```bash
skills add tankdonut/skills --skill <name> -g -y
skills ls -g
```

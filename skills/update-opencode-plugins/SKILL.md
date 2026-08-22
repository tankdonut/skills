---
name: update-opencode-plugins
description: Use when updating, upgrading, or bumping opencode plugin versions in opencode.json (user-level at ~/.config/opencode/opencode.json or project-level at .opencode/opencode.json), including resolving the latest npm release with an optional 7-day cooldown that skips too-fresh versions, and clearing the stale plugin cache at ~/.cache/opencode/packages so opencode never falls back to an older cached version.
---

# Update OpenCode Plugin Versions

## Overview

Keeps the `"plugin"` array in an `opencode.json` config current. Each entry is
`name@version` (or `@scope/name@version`); this skill resolves the latest
matching version from npm and rewrites the file, optionally skipping any version
published within the last 7 days.

After rewriting the config, the skill also clears every cached version of each
**bumped** plugin from `~/.cache/opencode/packages`. opencode caches every
installed plugin version side-by-side (`<name>@<ver>`); if a freshly-pinned
version is not yet fetched, opencode silently falls back to the newest *cached*
copy — which can be older than the pin and disagree with the current config
schema, breaking every agent. Clearing the cache for bumped plugins forces a
clean re-resolve on next start.

## Constants

| Constant | Value |
|----------|-------|
| User config | `~/.config/opencode/opencode.json` |
| Project config | `$PWD/.opencode/opencode.json` |
| Plugin cache | `~/.cache/opencode/packages` |
| npm registry | `https://registry.npmjs.org/<package>` |
| Default cooldown | 7 days |
| Autonomous defaults | scope: every existing config; cooldown: 7 days; stable only; cache clean on |

## When to Use

- User says "update / upgrade / bump opencode plugins".
- A plugin is misbehaving and a stale or too-new version is suspected.
- Routine maintenance of an opencode config.

Do NOT use for installing or removing plugins — only for changing `@version`
pins on entries that already exist in the `"plugin"` array.

## Flags

The skill accepts flags in the invocation — e.g.
`/update-opencode-plugins --default --yes` or "update plugins, `--latest`".
Flags map straight through to the helper and make the run deterministic and
non-interactive.

| Flag | Meaning |
|------|---------|
| `--default` | Non-interactive: anything the invocation did not decide takes the documented default — scope = every existing config, cooldown = 7 days, stable releases only, cache cleanup on. |
| `--yes` | Apply immediately; skip the dry-run confirmation gate. The helper still prints the diff as it writes. |
| `--latest` | Cooldown 0 — absolute newest stable release. |
| `--cooldown <days>` | Explicit cooldown in days. |
| `--user` / `--project` / `--both` | Explicit scope. `--both` processes every config that exists and reports missing ones. |
| `--prerelease` | Include beta/rc versions. Only when the user explicitly asks. |
| `--no-cache-clean` | Leave the plugin cache alone. Only when the user explicitly asks. |

**Autonomy contract:** when `--default` is present, or the flags already fix
every decision (scope + cooldown), NEVER use the `question` tool — decide from
the table above and state the chosen values in the final report. Precedence:
explicit user statement > explicit flag > `--default` defaults > interview.
Only interview for decisions that are still unresolved in an interactive run.
"Neither config exists" is a hard stop (report and end) — not a question.

## Workflow

1. **Parse flags.** Read the flags from the invocation (see **Flags**) and
   resolve the decision set: scope, cooldown, apply now (`--yes`),
   non-interactive (`--default` or all decisions flag-fixed).

2. **Locate configs.** Check both paths with `ls` / `Read`:
   - User: `~/.config/opencode/opencode.json`
   - Project: `$PWD/.opencode/opencode.json`
   Record which exist and whether each has a non-empty `"plugin"` array.
   Neither exists → stop and tell the user; do not invent a path.

3. **Interview — only for decisions still unresolved.** Skip a question when
   the invocation already answers it (flag or explicit user statement) or when
   the run is non-interactive. At most two questions, each single-choice:
   - **Scope** (if unknown): only one config exists → confirm using it; both
     exist → **User**, **Project**, **Both**.
   - **Cooldown** (if unknown): **7-day cooldown** (only versions ≥ 7 days
     old) or **Absolute latest**. Do not assume; present both.

4. **Run the helper once** with the resolved flags. The helper
   (`update-plugins.mjs`, beside this file) discovers configs by scope and
   does fetch, compare, write, and cache cleanup per config:

   ```bash
   # autonomous: documented defaults, apply, zero questions, zero confirmation
   node <this-skill-dir>/update-plugins.mjs --default --yes

   # autonomous preview: same decisions, dry run (diff + cache dirs, no writes)
   node <this-skill-dir>/update-plugins.mjs --default

   # interactive / explicit decisions
   node <this-skill-dir>/update-plugins.mjs --user --cooldown 7
   node <this-skill-dir>/update-plugins.mjs --config <path> --latest --yes
   ```

   `--cooldown 7` enables the cooldown; `--cooldown 0` / `--latest` means
   absolute latest. Add `--prerelease` only if the user explicitly wants
   beta/rc versions; stable releases are the default and what most users
   expect.

   **Cache cleanup is on by default.** After writing the config, the helper
   removes every cached version of each bumped plugin from
   `~/.cache/opencode/packages` (default) so opencode re-resolves fresh and
   cannot fall back to a stale older copy. Flags:
   - `--cache <dir>` — override the cache dir (rarely needed; defaults to
     `~/.cache/opencode/packages`).
   - `--no-cache-clean` — skip cache cleanup entirely. Use only if the user
     explicitly asks to leave the cache alone.

   The dry run lists the exact cache dirs it would remove under a
   "Stale cache dirs to remove:" heading. In interactive runs, show the user
   the dry-run diff (config changes **and** cache removals) before applying
   unless they already approved in the interview. With `--yes` (or prior
   approval) apply directly — the helper prints the same diff as it writes,
   and the report carries it.

5. **Report.** Summarize each change per config (`name: old -> new`), list the
   cache dirs that were removed (or note that cleanup was skipped), remind the
   user to restart opencode so the new plugin versions re-resolve and load,
   and — for flag-driven runs — state the values that were decided by flag or
   by `--default` (scope, cooldown).

## Behavior Rules

- **Never downgrade.** If the pinned version is newer than the target, skip.
- **Never rewrite unrelated keys.** The helper preserves JSON key order, the
  detected indentation, and the trailing newline. Do not hand-edit around it.
- **Never write broken JSON.** If a config fails to parse, report it, skip it,
  and keep processing any other configs; never write a file back in a broken state.
- **Scoped packages** (`@scope/name@x.y.z`) and **unpinned entries** (`"pkg"`)
  are handled; unpinned entries get pinned to the target version.
- **Plugins not on npm** are reported and skipped; the run continues for the rest.
- **Prereleases excluded by default.** Beta/rc versions (e.g. `1.2.3-beta`) are
  never selected unless `--prerelease` is passed. The cooldown decision only
  concerns release age, not stability.
- **Flag-driven runs never block.** With `--default` (or fully decided flags)
  do not ask questions and do not wait for confirmation; the helper's own
  output is the audit trail. Unresolved situations that flags cannot answer
  (e.g. neither config exists) end the run with a report, not a prompt.
- **Treat helper exit 1 as failure** and report it verbatim: no config found
  for the requested scope, a config unreadable, or invalid JSON. When several
  configs are processed, a failure in one is reported and the rest still run.
- **Clear cache only for bumped plugins.** Every cached version of a plugin
  whose pin changed is removed from `~/.cache/opencode/packages` (scoped
  packages nest under `<@scope>/`). Plugins that were not bumped are left
  untouched, even if old versions accumulate — this targets the stale-fallback
  failure mode without disturbing working installs. Pass `--no-cache-clean` to
  opt out. Cache cleanup runs only in `--yes` mode; the dry run reports what
  *would* be removed.

## Edge Cases

- No `"plugin"` array, or empty → that config reports "nothing to do" and is
  skipped; other configs still process. Nothing to do anywhere → report and
  stop (success).
- Scope flag names a missing config → `--user`/`--project` are hard errors;
  `--both` (and `--default`) report the miss and continue with what exists.
- No version is old enough under cooldown → that plugin is left untouched.
- `npm view`/registry unreachable → report the network error; do not guess versions.
- Cache dir absent, or no cached version exists for a bumped plugin → the helper
  reports "No stale cache entries found for bumped plugins" and continues; there
  is simply nothing to remove.
- A cache dir fails to delete (permissions, busy) → the error is reported for
  that one dir; the config write and other removals still succeed.

## Manual Fallback

If the helper is unavailable, do it inline per plugin:

```bash
npm view <pkg> time --json      # { version: "ISO date", ... }
npm view <pkg> dist-tags --json # { latest: "..." }
```

Pick the newest version whose publish time is `<= now - cooldownDays*86400000`,
compare with `semver`, and edit `opencode.json` preserving 2-space indentation
and the trailing newline. Then remove the stale cache for each bumped plugin so
opencode re-resolves fresh:

```bash
rm -rf ~/.cache/opencode/packages/<name>@*              # unscoped
rm -rf ~/.cache/opencode/packages/<@scope>/<name>@*     # scoped
```

Prefer the helper — it handles ordering, scoped names, idempotent writes, and
cache cleanup together.

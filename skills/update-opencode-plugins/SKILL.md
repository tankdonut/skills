---
name: update-opencode-plugins
license: MIT
description: Use when updating, upgrading, or bumping opencode plugin versions in opencode.json (user-level at ~/.config/opencode/opencode.json or project-level at .opencode/opencode.json), including resolving the latest npm release with an optional 7-day cooldown that skips too-fresh versions, clearing the stale plugin cache at ~/.cache/opencode/packages, pre-installing each bumped plugin into that cache with a fully controlled npm environment (ambient NPM_CONFIG_* stripped and overridden) so opencode loads exactly the pinned version, and briefing the user on the GitHub release notes between the old and new pins.
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

Finally, the skill takes **full control of plugin installation**. opencode
installs plugins with npm's own machinery in-process and feeds its entire
environment into npm's config loader (`packages/core/src/npm-config.ts` in
anomalyco/opencode), so ambient `NPM_CONFIG_*` variables — e.g. a
`NPM_CONFIG_USERCONFIG` npmrc carrying `min-release-age`, a registry mirror,
proxies — silently veto or redirect installs after the skill has already
pinned a version. The helper therefore pre-installs every bumped
`name@version` into the plugin cache itself, in a sanitized environment where
every `NPM_CONFIG_*` var is stripped and explicit values are set. opencode's
package loader (`packages/core/src/npm.ts`, `Npm.add`) has a fast path — an
existing `<cache>/<entry>/node_modules/<name>` dir skips its install entirely —
so the pre-installed dirs are used verbatim on next start: no network access,
no re-resolve, no ambient-env influence.

The run ends with a **release-notes briefing**: for every bump, the helper
fetches the package's GitHub releases in the `(old, new]` range and prints
titles, full bodies, and full-notes links — with explicit callouts for
MAJOR bumps and bodies mentioning breaking changes. The briefing never gates
the upgrade and never fails the run; when GitHub has nothing (no repository
link, non-GitHub host, API failure, no matching tags) it degrades to a
constructible compare URL.

## Constants

| Constant | Value |
|----------|-------|
| User config | `~/.config/opencode/opencode.json` |
| Project config | `$PWD/.opencode/opencode.json` |
| Plugin cache | `~/.cache/opencode/packages` |
| npm registry | `https://registry.npmjs.org/<package>` |
| Default cooldown | 7 days |
| Autonomous defaults | scope: every existing config; cooldown: 7 days; stable only; cache clean on; pre-install on; briefing on |

## When to Use

- User says "update / upgrade / bump opencode plugins".
- A plugin is misbehaving and a stale or too-new version is suspected.
- Routine maintenance of an opencode config.

Do NOT use for adding or removing plugin **entries** — only for changing
`@version` pins on entries that already exist in the `"plugin"` array.
(Pre-installing the bumped versions into the cache is part of the bump, not a
new-entry install.)

**Plugin-specific runbook:** `oh-my-openagent` (OmO) is the host plugin with
a fast-moving beta channel and its own `~/.omo/` state tree — never bump it
with a plain full-config run. Follow `oh-my-openagent.md` beside this file
(temp-config scope isolation, `~/.omo` backup, post-restart verification,
rollback).

## Flags

The skill accepts flags in the invocation — e.g.
`/update-opencode-plugins --default --yes` or "update plugins, `--latest`".
Flags map straight through to the helper and make the run deterministic and
non-interactive.

| Flag | Meaning |
|------|---------|
| `--default` | Non-interactive: anything the invocation did not decide takes the documented default — scope = every existing config, cooldown = 7 days, stable releases only, cache cleanup on, pre-install on. |
| `--yes` | Apply immediately; skip the dry-run confirmation gate. The helper still prints the diff as it writes. |
| `--latest` | Cooldown 0 — absolute newest stable release. |
| `--cooldown <days>` | Explicit cooldown in days. |
| `--user` / `--project` / `--both` | Explicit scope. `--both` processes every config that exists and reports missing ones. |
| `--prerelease` | Include beta/rc versions. Only when the user explicitly asks. |
| `--no-cache-clean` | Leave the plugin cache alone. Only when the user explicitly asks. |
| `--no-install` | Skip pre-installing bumped plugins into the cache; opencode installs them itself on restart, under whatever `NPM_CONFIG_*` env it was launched with. Only when the user explicitly asks. |
| `--registry <url>` | npm registry used for BOTH version resolution and pre-install (they can never disagree). Default `https://registry.npmjs.org`. |
| `--no-briefing` | Skip the release-notes briefing at the end of the run. Only when the user explicitly asks. |

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
    "Stale cache dirs to remove:" heading and the exact dirs it would
    pre-install into under a "Pre-install into cache" heading. In interactive
    runs, show the user the dry-run diff (config changes **and** cache
    removals) before applying unless they already approved in the interview.
    With `--yes` (or prior approval) apply directly — the helper prints the
    same diff as it writes, and the report carries it.

    **Pre-install is on by default** (`--yes` mode only). Before writing any
    config or removing any cache dir, the helper installs every bumped
    `name@version` into the plugin cache — additive only, so a failure aborts
    the run with nothing changed. The npm child runs in a controlled
    environment: every ambient `NPM_CONFIG_*` / `npm_config_*` var is stripped
    (including `NPM_CONFIG_USERCONFIG` indirection and auth material),
    userconfig/globalconfig point at empty temp files (npm rejects one file
    loaded as both roles — use two), and these are set explicitly:

    | Env var | Value | Why |
    |---------|-------|-----|
    | `NPM_CONFIG_REGISTRY` | the `--registry` value (default `https://registry.npmjs.org`) | install from the same registry versions were resolved from |
    | `NPM_CONFIG_MIN_RELEASE_AGE` | `0` | the cooldown above already decided eligibility; ambient npmrc must not re-veto |
    | `NPM_CONFIG_IGNORE_SCRIPTS` | `true` | parity with opencode's installer, which hardcodes `ignoreScripts: true` |
    | `NPM_CONFIG_UPDATE_NOTIFIER` / `_FUND` / `_AUDIT` | `false` | noise off |

    npm's precedence is env > project `.npmrc` > user npmrc > global, so the
    explicit env values cannot be overridden by any config file found from the
    install dir upward. The produced dir matches opencode's own
    Arborist-based installer in shape — `package.json` +
    `package-lock.json` + `node_modules/<name>` — so opencode's cache fast
    path (`Npm.add`) uses it verbatim with no network access on restart.

5. **Report.** Summarize each change per config (`name: old -> new`), list the
   cache dirs that were pre-installed and the ones that were removed (or note
   that cleanup / install was skipped), and condense the helper's
   release-notes briefing for the user — lead with any `⚠ MAJOR bump` or
   `⚠ breaking changes` callouts, then a line or two per plugin. Remind the
   user to restart opencode so the new plugin versions load (pre-installed
   ones come straight from the cache fast path), and — for flag-driven runs —
   state the values that were decided by flag or by `--default` (scope,
   cooldown).

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
- **Install before any write.** With pre-install on, every bumped version is
  installed into the cache *first*; only after all installs succeed (across
  every config in scope, deduplicated by `name@version`) are configs written
  and stale dirs removed. Any install failure aborts the run with zero
  changes — a working setup is never traded for a pin opencode can't fetch
  under its ambient env.
- **Own the install environment.** The npm child never sees ambient
  `NPM_CONFIG_*`: they are stripped, userconfig/globalconfig are redirected to
  empty temp files, and registry / `min-release-age=0` / `ignore-scripts` are
  set explicitly. `--registry` changes the resolution source and the install
  source together so they can never disagree. Auth material (`NPM_TOKEN` and
  any token-carrying `npm_config_*` vars) is stripped too — private registries
  requiring authentication are out of scope; the helper resolves from
  anonymous packument fetches.
- **Never treat a target dir as stale.** A cached — even partial —
  `<name>@<target>` dir is reused (fast-path skip) or cleanly reinstalled,
  never removed by the stale-cache sweep; only *other* versions of bumped
  plugins are removed.
- **Brief, never gate.** The release-notes briefing runs after the update (or
  at the end of a dry run) and is purely informational: it never blocks, never
  asks, never fails the run, and is skipped entirely with `--no-briefing`.
  Tag matching is best-effort (`v1.2.3`, `1.2.3`, `pkg@1.2.3` styles); release
  bodies are included in full with a full-notes link.

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
- `npm` missing from PATH, or an install fails (network, yanked version) → the
  run aborts before writing anything; the error names the plugin and the
  cause. Fix and re-run, or use `--no-install` to fall back to opencode's own
  install-on-restart.
- A partial cache dir left by an earlier failed install → the helper wipes and
  reinstalls it cleanly; the fast-path marker `node_modules/<name>` is what
  counts as "installed", so an install that finished without the marker is
  treated as failed and retried from scratch.
- Briefing has no repository link on npm, a non-GitHub repository, no matching
  release tags, or the GitHub API fails (e.g. anonymous rate limit, 60 req/h)
  → the section degrades to a one-line notice plus a compare URL
  (`github.com/<slug>/compare/v<old>...v<new>`, tag prefix guessed); the run
  itself is unaffected.

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

Then pre-install the bumped version into the cache with the same controlled
npm environment the helper uses (two *distinct* empty npmrc files — npm
rejects one file loaded as both userconfig and globalconfig):

```bash
: > /tmp/npmrc-user; : > /tmp/npmrc-global
dir=~/.cache/opencode/packages/<name>@<version>          # scoped: .../<@scope>/<name>@<version>
mkdir -p "$dir"
printf '{"name":"opencode-plugin","private":true,"dependencies":{"<name>":"<version>"}}\n' > "$dir/package.json"
NPM_CONFIG_USERCONFIG=/tmp/npmrc-user NPM_CONFIG_GLOBALCONFIG=/tmp/npmrc-global \
NPM_CONFIG_REGISTRY=https://registry.npmjs.org NPM_CONFIG_MIN_RELEASE_AGE=0 \
NPM_CONFIG_IGNORE_SCRIPTS=true npm install --omit=dev --ignore-scripts --prefix "$dir"
```

Prefer the helper — it handles ordering, scoped names, idempotent writes,
cache cleanup, and the controlled install environment together.

---
name: update-opencode-plugins
description: Use when updating, upgrading, or bumping opencode plugin versions in opencode.json (user-level at ~/.config/opencode/opencode.json or project-level at .opencode/opencode.json), including resolving the latest npm release with an optional 7-day cooldown that skips too-fresh versions.
---

# Update OpenCode Plugin Versions

## Overview

Keeps the `"plugin"` array in an `opencode.json` config current. Each entry is
`name@version` (or `@scope/name@version`); this skill resolves the latest
matching version from npm and rewrites the file, optionally skipping any version
published within the last 7 days.

## Constants

| Constant | Value |
|----------|-------|
| User config | `~/.config/opencode/opencode.json` |
| Project config | `$PWD/.opencode/opencode.json` |
| npm registry | `https://registry.npmjs.org/<package>` |
| Default cooldown | 7 days |

## When to Use

- User says "update / upgrade / bump opencode plugins".
- A plugin is misbehaving and a stale or too-new version is suspected.
- Routine maintenance of an opencode config.

Do NOT use for installing or removing plugins — only for changing `@version`
pins on entries that already exist in the `"plugin"` array.

## Workflow

1. **Locate configs.** Check both paths with `ls` / `Read`:
   - User: `~/.config/opencode/opencode.json`
   - Project: `$PWD/.opencode/opencode.json`
   Record which exist and whether each has a non-empty `"plugin"` array.

2. **Interview scope** (one `question`, single choice). The option set depends on
   what exists:
   - Only one config exists → confirm using it.
   - Both exist → options: **User**, **Project**, **Both**.
   - Neither exists → stop and tell the user; do not invent a path.

3. **Interview cooldown** (one `question`, single choice):
   - **7-day cooldown** — only upgrade to the newest version at least 7 days old.
   - **Absolute latest** — newest version regardless of age.
   Do not assume; present both. If the user already stated a preference, skip.

4. **Run the helper** once per chosen config. The helper (`update-plugins.mjs`,
   beside this file) does fetch, compare, and write:

   ```bash
   # dry run first (prints a diff, writes nothing)
   node <this-skill-dir>/update-plugins.mjs --config <path> --cooldown <0|7>
   # then apply after the user confirms (or skip if already approved)
   node <this-skill-dir>/update-plugins.mjs --config <path> --cooldown <0|7> --yes
   ```

   `--cooldown 7` enables the cooldown; `--cooldown 0` means absolute latest.
   Add `--prerelease` only if the user explicitly wants beta/rc versions;
   stable releases are the default and what most users expect.
   Always show the user the dry-run diff before applying unless they already
   approved in the interview.

5. **Report.** Summarize each change (`name: old -> new`) and remind the user to
   restart opencode so the new plugin versions load.

## Behavior Rules

- **Never downgrade.** If the pinned version is newer than the target, skip.
- **Never rewrite unrelated keys.** The helper preserves JSON key order, the
  detected indentation, and the trailing newline. Do not hand-edit around it.
- **Never write broken JSON.** If the config fails to parse, report and stop.
- **Scoped packages** (`@scope/name@x.y.z`) and **unpinned entries** (`"pkg"`)
  are handled; unpinned entries get pinned to the target version.
- **Plugins not on npm** are reported and skipped; the run continues for the rest.
- **Prereleases excluded by default.** Beta/rc versions (e.g. `1.2.3-beta`) are
  never selected unless `--prerelease` is passed. The cooldown interview only
  concerns release age, not stability.

## Edge Cases

- No `"plugin"` array, or empty → report "nothing to update" and stop.
- No version is old enough under cooldown → that plugin is left untouched.
- `npm view`/registry unreachable → report the network error; do not guess versions.

## Manual Fallback

If the helper is unavailable, do it inline per plugin:

```bash
npm view <pkg> time --json      # { version: "ISO date", ... }
npm view <pkg> dist-tags --json # { latest: "..." }
```

Pick the newest version whose publish time is `<= now - cooldownDays*86400000`,
compare with `semver`, and edit `opencode.json` preserving 2-space indentation
and the trailing newline. Prefer the helper — it handles ordering, scoped names,
and idempotent writes.

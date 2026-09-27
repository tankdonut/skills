---
name: configure-opencode
license: MIT
description: Use when creating or editing opencode configuration — opencode.json, opencode.jsonc, or tui.json at user level (~/.config/opencode/) or project level (.opencode/) — covering plugins, custom agents, commands, MCP servers, permissions, keybinds, themes, and plugin config files like dcp.json or opencode-mem.jsonc; when config edits are not taking effect; or when troubleshooting plugin cache staleness or config precedence.
---

# Configure OpenCode

## Overview

Safe, correct edits to the opencode config surface on this setup
(opencode 1.18.x). Covers the file map, precedence, plugin pinning,
secrets handling, and post-edit verification. Full schema key lists,
code-level citations, and CLI verbs live in
[reference/opencode-config-reference.md](reference/opencode-config-reference.md).

Facts below are verified against the v1.18.31 source (tag `014614d`,
`anomalyco/opencode`; `sst/opencode` redirects there). The live docs at
opencode.ai now describe v2 — drift is flagged wherever it bites.

## Ground truth — this setup

| Path (under `~/.config/opencode/`) | Role |
|---|---|
| `opencode.json` | Main config: `permission`, per-`agent` overrides, `plugin` array |
| `tui.json` | TUI config: `theme`, own `plugin` subset, `scroll_acceleration` |
| `themes/*.json` | Custom theme files |
| `dcp.json` | @tarquinen/opencode-dcp config (context-pruning thresholds, `turnProtection`) |
| `opencode-mem.jsonc` | opencode-mem config — JSONC (comments allowed) |
| `oh-my-openagent/native-nudge.json` | oh-my-openagent data |
| *(API key file)* | **Secret** — key material lives in a standalone file in the config dir, referenced only via `file://`; never inline it, print it, or commit it |
| `package.json`, `node_modules/`, `bun.lock`, `lsp-install-decisions.json` | Auto-managed by opencode / plugin host — do not hand-edit |
| `*.bak-<timestamp>` | Manual backup copies — the established pre-edit habit |

Current plugin pins: `@tarquinen/opencode-dcp@3.2.0` (both configs),
`oh-my-openagent@5.0.0` (both configs), `cc-safety-net@2.4.6` and
`opencode-mem@2.26.0` (main config only).

Other locations:

| Path | Role |
|---|---|
| `~/.cache/opencode/packages/<name@version>/node_modules/<name>` | Plugin cache — version is part of the dir name |
| `~/.local/share/opencode/auth.json` | Provider credentials (`opencode auth login`) |
| `~/.local/share/opencode/mcp-auth.json` | MCP OAuth tokens (`opencode mcp auth`) |
| `~/.agents/skills/` | Global skills — inventory in `tankdonut/skills` `scripts/global-skills.json` |

## Config surface

Precedence (later wins; verified in v1.18.31 `config.ts`):

1. Remote org config (`.well-known/opencode`)
2. Global `~/.config/opencode/opencode.json(c)`
3. `OPENCODE_CONFIG` env (custom file)
4. Project `opencode.json(c)` — findUp from cwd, nearest wins
5. `.opencode/` directories (each may carry its own `opencode.json(c)` **and override #4**)
6. `OPENCODE_CONFIG_CONTENT` env (inline JSON)
7. Managed dir (`/etc/opencode/` on Linux)
8. macOS MDM (highest, not overridable)

Load-bearing facts:

- Configs **merge, never replace; arrays concatenate** — a plugin list in a
  project config *adds to* the global list, it does not shadow it.
- JSON and JSONC both parse everywhere (`opencode.json` may hold comments,
  though prefer `.jsonc` when commenting). `dcp.json` is strict JSON.
- `config.json` is a **global-dir-only legacy name** (and the TOML-migration
  write target). It is not recognized at project level — don't create one.
- `theme`, `keybinds`, and a nested `tui` key in `opencode.json` are
  deprecated and auto-migrated into `tui.json` — put them in `tui.json`
  directly.
- `tui.json` plugin entries are TUI-kind plugins, tracked per source file;
  `plugin_enabled` (per-plugin boolean map) disables a TUI plugin without
  removing its pin.
- Custom agents/commands live in `{agent,agents}/**/*.md` and
  `{command,commands}/**/*.md` under `~/.config/opencode/` (global) or
  `.opencode/` (project). Use **plural** dir names — v2 convention,
  supported today.

## Editing rules

1. **Back up first**: `cp tui.json tui.json.bak-$(date +%Y%m%d-%H%M%S)`.
2. **Pin plugins exactly** (`name@version`, never bare `name`): unpinned
   entries resolve to `name@latest`, whose cache dir never refreshes after
   first install.
3. **Mirror shared pins**: when a plugin is pinned in both `opencode.json`
   and `tui.json`, `tui.json` must hold the same version. Version bumps go
   through the `update-opencode-plugins` skill (cache-safe, release-notes
   briefing) — don't bump by hand.
4. **Secrets stay out-of-band**: API keys via `file://…` (opencode-mem
   pattern), `{file:path}` / `{env:VAR}` substitution in `opencode.json`.
   Never paste key material into any config or chat.
5. **Permission key order is semantic**: rules match last-one-wins with key
   order preserved — put specific patterns above `"*"`.
6. Preserve existing indentation and trailing newlines; keep `.jsonc`
   comments intact when editing `opencode-mem.jsonc`.
7. Leave `package.json` / `node_modules` / `bun.lock` in config dirs alone —
   opencode maintains them for plugin helper deps.

## Common tasks

**Add an npm plugin** — append `"name@x.y.z"` to `opencode.json` `plugin`;
add to `tui.json` too only if it must run in the TUI (same pin). Restart
opencode — it installs into the version-keyed cache dir on first start.

**Add an agent** (`.opencode/agents/reviewer.md` or global equivalent):

```markdown
---
description: Reviews Go code against house conventions
mode: subagent
model: provider/model-id
permission:
  bash:
    "go test*": allow
temperature: 0.2
---
System prompt body…
```

`description` is required; `tools` is deprecated (use `permission`);
`opencode agent create` scaffolds interactively.

**Add a command** — `.opencode/commands/fix.md` with frontmatter
`description` (+ optional `agent`, `model`, `subtask`); body supports
`$ARGUMENTS`/`$1…`, `` !`shell cmd` `` injection, `@file` references.

**Add an MCP server** — prefer `opencode mcp add <name> --url … --env K=V`
(patches config correctly) over hand-editing the `mcp` key.

**Grant a permission** — pattern object under `read`/`edit`/`bash`/…:

```json
"permission": { "edit": { ".omo/**": "allow", "*": "ask" } }
```

`webfetch`/`websearch` accept a bare `"allow"|"ask"|"deny"` only.

**Switch model / theme / keybinds** — `model: "provider/model-id"` in
`opencode.json`; `theme` in `tui.json` (custom JSON in `themes/`);
keybind overrides in `tui.json` `keybinds`.

## Verification

- Strict-JSON configs: `jq empty <file>` (or `node -e
  "JSON.parse(require('fs').readFileSync('<file>','utf8'))"`).
- Resolved-config proof: `opencode debug config`.
- Plugins/MCP picked up: restart opencode, then `opencode mcp list`.
- Never declare done from the edit alone — confirm the resolved config
  shows the change.

## Common mistakes

| Mistake | Reality |
|---|---|
| Trusting current opencode.ai docs for cache paths | v2 docs say `~/.cache/opencode/node_modules/`; v1.18.x uses `~/.cache/opencode/packages/<name@version>/` (installs run via npm arborist, not Bun) |
| Expecting project config to *replace* global | Arrays concat across precedence levels |
| Editing `theme`/`keybinds` in `opencode.json` | Deprecated keys — auto-migrated to `tui.json`; edit `tui.json` |
| Bare plugin names (`"foo"`) | Resolve to `@latest`; cached forever, never refreshed |
| Removing a plugin from `opencode.json` but leaving it in `tui.json` | TUI-kind plugins keep loading — clear both |
| `config.json` at project root | Not a recognized project filename |
| Hand-editing `package.json` / `bun.lock` in config dirs | Auto-managed; changes get clobbered |

## Cross-references

- **Plugin version bumps**: use the `update-opencode-plugins` skill —
  npm resolution, cooldown, cache hygiene, release-notes briefing.
- **Project-scoped skills**: use `bootstrap-skills` (skills-lock.json flow).
- Deep detail (schema keys, precedence citations, CLI verbs, plugin
  mechanics): [opencode-config-reference.md](reference/opencode-config-reference.md).

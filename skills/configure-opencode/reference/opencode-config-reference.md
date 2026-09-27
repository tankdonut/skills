# OpenCode config reference (v1.18.31, code-verified)

Companion to [../SKILL.md](../SKILL.md). All source claims verified against the
v1.18.31 tag `014614d35b397775e5d397a490fc72368c894ec2` of
`anomalyco/opencode` (`sst/opencode` redirects there). Live docs at
opencode.ai describe **v2**; differences flagged with ⚠️.

## Filenames & discovery

| Location | Filenames (priority order) |
|---|---|
| Global `~/.config/opencode/` | `opencode.jsonc` → `opencode.json` → `config.json` (legacy, global-only) |
| Project (findUp to worktree root, nearest wins) | `opencode.jsonc`, `opencode.json` |
| Each `.opencode/` dir | own `opencode.json` / `opencode.jsonc` |
| TUI (global → project → `.opencode`) | `tui.json`, `tui.jsonc` |

- JSON **and** JSONC parse everywhere (jsonc-parser).
- Merge semantics: deep merge, **arrays concatenate**
  (`mergeConfigConcatArrays`).
- Env overrides: `OPENCODE_CONFIG` (custom file), `OPENCODE_CONFIG_CONTENT`
  (inline JSON), `OPENCODE_CONFIG_DIR`, `OPENCODE_TUI_CONFIG`,
  `OPENCODE_DISABLE_PROJECT_CONFIG`.
- Value substitution in configs: `{env:VAR}`, `{file:path}`.

Full precedence (later wins): remote `.well-known/opencode` → global →
`OPENCODE_CONFIG` → project findUp → `.opencode` dirs (+`~/.opencode`,
`OPENCODE_CONFIG_DIR`) → `OPENCODE_CONFIG_CONTENT` → managed dir
(`/etc/opencode/` Linux, `/Library/Application Support/opencode/` macOS,
`%ProgramData%\opencode` Windows) → macOS MDM (`ai.opencode.managed`).

## `opencode.json` top-level keys (v1.18.31 `ConfigV1.Info`)

`$schema`, `shell`, `logLevel`, `server`, `command`, `skills`,
`references`/`reference`, `watcher`, `snapshot`, `plugin`, `share`,
`autoshare`, `autoupdate` (`true|false|"notify"`), `disabled_providers`,
`enabled_providers`, `model`, `small_model`, `default_agent`,
`subagent_depth`, `username`, `agent`, `provider`, `mcp`, `formatter`,
`lsp`, `instructions`, `layout`, `permission`, `tools`, `attachment`,
`tool_output`, `compaction`, `enterprise`, `experimental`.

Not keys: `theme`, `keybinds`, `tui` — deprecated, auto-migrated to
`tui.json`. `mode` is legacy (old `mode(s)/*.md` files fold into `agent`).

Schema: <https://opencode.ai/config.json> · docs: <https://opencode.ai/docs/config/>

### Sub-schemas

- **`permission`** — bare `"ask"|"allow"|"deny"` (→ `{"*": action}`) or
  object keyed by `read, edit, glob, grep, list, bash, task,
  external_directory, todowrite, question, webfetch, websearch, lsp,
  doom_loop, skill`. Pattern objects (`{"git push": "ask", "*": "allow"}`)
  allowed for `read/edit/glob/grep/list/bash/task/external_directory/lsp/skill`;
  the rest are shorthand-only. **Key order preserved; last match wins.**
- **`mcp`** — local: `type:"local"`, `command[]`, `cwd`, `environment`,
  `enabled`, `timeout` (ms, default 5000). Remote: `type:"remote"`, `url`,
  `headers`, `oauth` (object|false), `enabled`, `timeout`.
- **`plugin`** — `Array<string | [name, options-object]>`; tuple form
  passes per-plugin options.

## `tui.json` keys (v1.18.31)

| Key | Type / notes |
|---|---|
| `$schema` | `https://opencode.ai/tui.json` |
| `theme` | string |
| `keybinds` | overrides merged onto defaults |
| `plugin` | same Spec union as `opencode.json` (TUI-kind) |
| `plugin_enabled` | `Record<string, boolean>` — disable without unpinning |
| `leader_timeout` | number |
| `attention` | `{enabled, notifications, sound, volume, sound_pack, sounds}` |
| `prompt` | `{max_height, max_width}` |
| `scroll_speed` | number |
| `scroll_acceleration` | `{enabled}` |
| `diff_style` | enum incl. `"auto"` |
| `cursor` | `{style: block/underline/line/default, blinking}` |
| `mouse` | boolean (default `true`) |

Legacy `theme`/`keybinds`/`tui` keys in `opencode.json` auto-migrate here.
Docs: <https://opencode.ai/docs/tui/>, <https://opencode.ai/docs/keybinds/>,
<https://opencode.ai/docs/themes/>

## Agents & commands

- Globs (every config dir): agents `{agent,agents}/**/*.md`; commands
  `{command,commands}/**/*.md`; local plugins `{plugin,plugins}/*.{ts,js}`;
  legacy modes `{mode,modes}/*.md`. Plural preferred (v2 convention).
- Agent frontmatter: `description` (**required**), `mode`
  (`primary|subagent|all`, default `all`), `model` (`provider/model-id`),
  `temperature`, `top_p`, `steps` (`maxSteps` deprecated), `permission`
  (same shape as global), `tools` (deprecated), `hidden`, `color`,
  `disable`; body = system prompt.
- Command frontmatter: `description`, `agent`, `model`, `subtask`; body is
  the template with `$ARGUMENTS`, `$1…$n`, `` !`shell` `` injection, `@file`.

Docs: <https://opencode.ai/docs/agents/>, <https://opencode.ai/docs/commands/>

## Plugin mechanics (v1.18.31)

1. Spec parse via `npm-package-arg` + semver: `name@version` pins exactly;
   bare `name` → `name@latest`.
2. Cache: `~/.cache/opencode/packages/<full-spec>/node_modules/<name>` —
   version embedded in the dir name, so pinned bumps install fresh.
   ⚠️ v2 docs instead document `~/.cache/opencode/node_modules/` + Bun;
   v1.18.x installs via `@npmcli/arborist`.
3. Early-return if `<dir>/node_modules/<name>` exists, **no version
   re-check** → `name@latest` dirs go stale forever; always pin.
4. `engines.opencode` semver range checked against the running version.
5. `@opencode-ai/plugin` helper dep is npm-installed **into every config
   dir** (auto-creates `package.json` + `.gitignore` covering
   `node_modules`, `package.json`, `bun.lock`) — for local plugin dev
   only; pinned plugins never land in config-dir `node_modules`.
6. Load order: global config → project config → global `plugins/` dir →
   project `plugins/` dir; same name+version loads once; `tui.json`
   plugins load additionally as TUI-kind with `plugin_enabled` toggles.

Docs: <https://opencode.ai/docs/plugins/>

## CLI verbs (v1.18.31 registry)

| Command | Purpose |
|---|---|
| `opencode debug config` | Print fully resolved config (precedence proof) |
| `opencode mcp add <name> [--url --env K=V --header …]` | Add server (patches config) |
| `opencode mcp list` / `mcp auth <name>` / `mcp logout <name>` / `mcp debug <name>` | MCP inventory & OAuth |
| `opencode auth login [url]` / `auth logout` / `auth list` | `auth` = alias of the `providers` group; credentials in `~/.local/share/opencode/auth.json` |
| `opencode plugin <module>` (alias `plug`) | Install plugin **and patch opencode.json/tui.json** |
| `opencode agent create` | Interactive agent scaffold |
| `opencode upgrade [target]` | Self-upgrade |
| `opencode models` / `opencode serve` | Provider models / headless server |

No dedicated `config validate` exists — validate via `$schema` in-editor
plus `opencode debug config`.

## v1 ↔ v2 doc drift (⚠️ read before citing docs)

| Topic | v1.18.31 reality | Current docs (v2) |
|---|---|---|
| Plugin cache | `~/.cache/opencode/packages/<spec>/` | `~/.cache/opencode/node_modules/` |
| Installer | `@npmcli/arborist` (npm) | Bun |
| Repo | `anomalyco/opencode` (sst redirects) | same |
| Dir naming | singular + plural both globbed | plural canonical, singular back-compat |

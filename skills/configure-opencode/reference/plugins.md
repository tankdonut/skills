# Plugin catalog & workflows

Companion to [../SKILL.md](../SKILL.md). Catalog entries are
setup-agnostic: pin the version you verified, bring your own values for
the config templates. Mechanics (pinning, cache, load order) are in
[opencode-config-reference.md](opencode-config-reference.md).

## Choosing

Pick by need — entries are independent unless noted:

| Plugin (npm) | Kind | Config file (in config dir) | Provides |
|---|---|---|---|
| `@tarquinen/opencode-dcp` | server | `dcp.json` | Dynamic context pruning (compress + turn protection) |
| `opencode-mem` | server | `opencode-mem.jsonc` | Long-term memory, auto-capture, user profile |
| `oh-my-openagent` | server + TUI | data files only | Orchestration host: agents, skills, commands, model routing |
| `cc-safety-net` | server | none | Shell-command guardrails (e.g. blocks risky `rm -rf` outside cwd) |

Any other npm plugin follows the generic workflow below.

## Generic workflow — install

1. Resolve an exact version: `npm view <name> version` (or `dist-tags`
   for channels). Never pin a dist-tag; never leave the name bare.
2. Back up configs: `cp <file> <file>.bak-$(date +%Y%m%d-%H%M%S)`.
3. Add `"name@x.y.z"` to the `plugin` array in `opencode.json`. Add the
   same pin to `tui.json` **only** if the plugin must also run in the TUI.
4. Create the per-plugin config file if the catalog says one is needed.
5. Restart opencode — it installs into
   `~/.cache/opencode/packages/name@x.y.z/node_modules/name` on start.
6. Verify: `opencode debug config` shows the pin; the cache dir exists;
   the plugin's behavior is observable (see per-plugin checks).

Tuple form `["name@x.y.z", {…}]` passes per-plugin options at pin time.

## Generic workflow — remove

1. Delete the pin from `opencode.json` **and** from `tui.json` — TUI-kind
   entries keep loading even when the server pin is gone.
2. Delete the per-plugin config file (it is inert without the plugin).
3. Restart. Optional: clear `~/.cache/opencode/packages/name@*` — note
   recursive deletes outside cwd may be blocked by safety plugins; the
   `update-opencode-plugins` helper's internal sweep is the sanctioned path.

## Generic workflow — disable without removing

- TUI-kind: `tui.json` → `"plugin_enabled": { "name": false }`.
- Server-kind: no enabled flag exists — comment out (JSONC) or remove
  the pin.

## Catalog entries

### @tarquinen/opencode-dcp — context pruning

Compresses conversation history when context fills (percent-of-max
thresholds per model) and protects recent turns from pruning.

`dcp.json` template (strict JSON; schema:
`https://raw.githubusercontent.com/Opencode-DCP/opencode-dynamic-context-pruning/master/dcp.schema.json`):

```json
{
  "$schema": "https://raw.githubusercontent.com/Opencode-DCP/opencode-dynamic-context-pruning/master/dcp.schema.json",
  "autoUpdate": false,
  "compress": {
    "maxContextLimit": "75%",
    "minContextLimit": "50%",
    "modelMaxLimits": { "<provider/model-id>": 750000 },
    "modelMinLimits": { "<provider/model-id>": 500000 },
    "nudgeFrequency": 10,
    "iterationNudgeThreshold": 30,
    "protectUserMessages": true
  },
  "turnProtection": { "enabled": true, "turns": 5 }
}
```

Check: `dcp` activity in session logs once context passes the min limit.

### opencode-mem — memory

Stores memories in a local vector DB (`~/.opencode-mem/data` by default),
injects profile/context, optionally auto-captures in the background.

`opencode-mem.jsonc` decision points (JSONC — comments allowed):

- **Embeddings**: `"embeddingModel"` defaults to
  `Xenova/nomic-embed-text-v1` (local, no API key). Alternatives listed
  in the file's own comments.
- **Recall model** — two routes, pick one:
  - `"opencodeProvider": "<provider>"` + `"opencodeModel": "<model>"` —
    reuses opencode's own auth (zero extra keys); check the plugin's
    known-issue notes for structured-output bugs on your opencode version.
  - Direct API: `"memoryProvider": "openai-chat"` (any OpenAI-compatible
    endpoint) or `"anthropic"`, plus `memoryApiUrl`, `memoryModel`, and
    `memoryApiKey` as `"file://<path>"` or `"env://VAR"` — **never inline**.
- **Auto-capture**: `autoCaptureEnabled` requires an external API route;
  raise `autoCaptureIterationTimeout` for reasoning models; set
  `memoryTemperature: false` for models that reject the parameter.
- Pick a `memoryModel` that honors `response_format` JSON schemas — some
  small models 500 on it.

Check: `memory` tool returns results; web UI on `webServerPort` (default
4747) if `webServerEnabled`.

### oh-my-openagent — orchestration host

Not a leaf plugin: it supplies the agents, skills, commands, and model
routing other things depend on, and owns the `~/.omo/` state tree. No
hand-written config file; its data lives under `oh-my-openagent/` in the
config dir and `~/.omo/omo.jsonc` (model overrides).

- Pin in **both** `opencode.json` and `tui.json` (it is server + TUI).
- Installing/removing it changes every session's agent surface — treat as
  a high-impact change: back up `~/.omo` first, restart, then verify
  agents/skills/commands are present.
- Updates (stable vs beta channels) have a dedicated runbook:
  [../../update-opencode-plugins/oh-my-openagent.md](../../update-opencode-plugins/oh-my-openagent.md).

### cc-safety-net — shell guardrails

Zero-config: installs via pin alone and enforces shell-command policy
(for example, vetoing `rm -rf` outside the working directory). No config
file; verify by observing a blocked dangerous command in a scratch shell.

## Updating pins

Version bumps go through the `update-opencode-plugins` skill (npm
resolution, cooldown, cache hygiene, release-notes briefing) — never
hand-edit pins to move versions.

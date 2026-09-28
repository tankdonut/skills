# Defaults profile

Companion to [../SKILL.md](../SKILL.md). A defaults profile captures a
real opencode configuration — generated from what's live, replayable
onto any environment. Helper: `scripts/apply-profile.mjs`
(zero-dep, Node 18+; run `--help` for flags).

## Layout

```text
<profile>/                  default ~/.config/opencode/bootstrap/
  profile.json              { "opencode": <partial>, "tui": <partial>, "secrets": [refs] }
  plugin-configs/           verbatim plugin config files (JSONC comments preserved)
  themes/                   verbatim theme JSON files
```

Override the location with `--profile <dir>` — the default sits outside
any repo on purpose (see Privacy).

## Create from the current configuration

```bash
node scripts/apply-profile.mjs --init            # → ~/.config/opencode/bootstrap/
node scripts/apply-profile.mjs --init --dir <live-config-dir> --profile <dir> [--force]
```

- Reads `opencode.json(c)` / `tui.json(c)` (JSONC parses fine; the
  profile re-serializes those partials, so comments survive only in the
  verbatim `plugin-configs/` copies).
- Copies the known plugin-config set (`dcp.json`, `opencode-mem.jsonc`)
  and `themes/*.json` verbatim.
- Scans captured values for `file://` / `env://` references and records
  them as the secrets checklist.

## Replay onto a target

```bash
node scripts/apply-profile.mjs --dir <target-config-dir>            # dry run (exit 2 when changes pending)
node scripts/apply-profile.mjs --dir <target-config-dir> --apply    # write
```

Merge semantics:

- Objects deep-merge; **profile wins** on conflicting keys; keys the
  profile doesn't mention are left untouched.
- `plugin` arrays merge as a **union keyed by package name**, the
  profile's pin winning for the same plugin — existing extra pins
  survive.
- Every other array is replaced by the profile's value.
- Every write backs up first (`<file>.bak-<timestamp>`); plugin-configs
  and themes copy verbatim with backup on collision.
- Nothing is ever deleted.

The run always ends with the manual secret checklist and the restart +
`opencode debug config` verification reminder.

## Secrets

Contents are never captured — only references. After a replay:

1. Place each `file://`-referenced key file (or provide the `env://`
   variables).
2. Provider credentials and MCP OAuth live outside configs entirely:
   `opencode auth login` / `opencode mcp auth <name>`.

## Privacy

The profile mirrors a real configuration — exact pins, tuned values,
themes, permission patterns. Keep it private: sync it through your own
dotfiles channel or a private repo, never through a public one.
Pointing `--profile` inside a public repo works technically but undoes
scrub discipline; that's an explicit risk decision, not a default.

## Fresh-machine bootstrap sequence

1. Global skills: `node scripts/restore-skills.mjs` from a
   tankdonut/skills clone.
2. Config: `apply-profile.mjs --dir ~/.config/opencode --apply`.
3. Manual secret steps from the checklist; `opencode auth login` for
   providers.
4. Restart opencode; verify with `opencode debug config` and the
   plugin-cache probe from
   [opencode-config-reference.md](opencode-config-reference.md).

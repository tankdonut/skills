# Safely updating oh-my-openagent (OmO)

`oh-my-openagent` is not just another plugin: it is the host plugin that
provides the agents, skills, commands, and model routing used by every
session. It also maintains a fast-moving beta channel and owns the `~/.omo/`
state tree (including `omo.jsonc`, which carries model overrides). Bumping it
deserves stricter handling than a routine plugin update.

This runbook was proven end-to-end on a 4.19.4 → 5.0.0-beta.56 upgrade
(MAJOR, 54 betas in range). Follow it verbatim.

## Channel and cooldown matrix

OmO publishes three dist-tags: `latest` (stable), `beta`, and a stale `next`.
The helper's flags interact with them in ways that produce wrong targets if
mixed carelessly:

| Goal | Flags on a temp config | Trap if run on the real config |
|------|------------------------|-------------------------------|
| Newest stable | `--latest` | `--latest` also bumps every other plugin past cooldown eligibility — including versions a 7-day dry run deliberately hid, and *stale betas of other plugins* when combined with `--prerelease` |
| Newest beta | `--prerelease --latest` | Same as above |
| "Beta with cooldown" | `--prerelease --cooldown 7` | **Wrong target**: picks the newest beta *at least 7 days old* — a stale beta, not the latest one. The beta channel moves ~1.7 releases/day, so cooldown and beta are incompatible goals |
| Cooldown-gated stable | `--cooldown 7` | Safe; the only combination that may run on the real config |

Rules of thumb:

- Channel jumps (stable → beta, beta → beta) always go through a **temp
  config**; see below.
- Always pin an **exact version**. Never leave OmO unpinned and never pin a
  dist-tag — a pin like `oh-my-openagent@beta` silently moves under you.
- A beta pin is safe from later stable runs: the helper never downgrades and
  `5.0.0-beta.56 > 4.19.4`, so `latest`-targeted runs skip it.

## Scope isolation via temp config

The helper has no per-plugin flag; it re-evaluates every entry in the config
it processes. To bump exactly one plugin, hand it a stripped temp config:

```bash
# <current> = the version currently pinned in the real config
printf '{\n  "plugin": [\n    "oh-my-openagent@<current>"\n  ]\n}\n' \
  > /tmp/opencode/opencode-omo-only.json

node <skill-dir>/update-plugins.mjs \
  --config /tmp/opencode/opencode-omo-only.json \
  --prerelease --latest --yes        # drop --prerelease for the stable channel
```

The helper then does the whole safe sequence for exactly that plugin:
controlled-env pre-install into `~/.cache/opencode/packages`, stale-cache
sweep of the plugin's *other* versions, and the release-notes briefing. It
writes the throwaway temp config — the real config is edited by hand
afterwards (one token), so the diff stays surgical.

## Procedure

**0. Pre-flight (no mutations).** Back up both coupling points and re-check
the tag — beta releases land multiple times a day:

```bash
ts=$(date +%Y%m%d-%H%M%S)
cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.bak-$ts
mkdir -p /tmp/opencode
tar -czf /tmp/opencode/omo-backup-$ts.tar.gz -C ~ .omo   # live sockets are skipped safely
npm view oh-my-openagent dist-tags --json
```

**1. Pre-install + sweep via the temp-config helper run** (above). Verify the
fast-path marker before touching the real config:

```bash
node -e "console.log(require(process.env.HOME +
  '/.cache/opencode/packages/oh-my-openagent@<target>/node_modules/oh-my-openagent/package.json').version)"
```

**2. Surgical pin edit.** Change only the version token on the OmO line of
the real `opencode.json`, preserving key order, indentation, and the trailing
newline. Then validate:

```bash
python3 -m json.tool ~/.config/opencode/opencode.json > /dev/null
diff ~/.config/opencode/opencode.json.bak-<ts> ~/.config/opencode/opencode.json
# expected: exactly one changed line
```

**3. Restart opencode.** Plugins load once at process start (cache fast
path). In-flight sessions keep the old version until they are restarted.

**4. Post-restart verification.** Four checks, in order of strength:

```bash
# a) The live process proves the loaded version: OmO's LSP daemon runs with
#    the cache dir path in its argv.
ps -eo pid,lstart,args | grep -F 'oh-my-openagent@' | grep -v grep

# b) No surprise config migration: mtime of omo.jsonc must predate the upgrade.
stat -c '%y' ~/.omo/omo.jsonc
```

c) Functional memory recall: run a memory search that must return a known
stored item (in v5 the resident Kibitzer sidecar is the only recall path).

d) Agents, skills, and commands are all present and the session works.

**5. Rollback** (if the beta misbehaves): restore the config backup, restore
the `~/.omo` tarball if v5 rewrote anything under it, and re-install the old
version into the cache with the Manual Fallback block from `SKILL.md` (the
helper never downgrades), then restart. ~2 minutes total when scripted in
advance.

## Field notes

- **asdf shims do not survive `env -i`**: npm exits 126 *silently* (no
  output) because the shim execs `asdf`, which needs its own environment.
  Never sanitize npm's env by emptying it; strip only `NPM_CONFIG_*`,
  `npm_config_*`, and `NPM_TOKEN` from the full environment. The helper
  already does exactly this — prefer it over manual npm invocations.
- **Manual `rm -rf` on cache dirs outside the working directory is blocked**
  by cc-safety-net's `rm.recursive-force-outside-cwd` rule. The helper's
  internal cache deletes do not route through the shell hook, which is
  another reason to let it do the sweep.
- **The briefing can be huge on channel jumps** (54 releases on the
  4.19.4 → 5.0.0-beta.56 jump). Condense it for the user: lead with the
  MAJOR/breaking callouts, then themes; skip per-release bodies unless asked.
- **Engine warnings at install time are usually moot at runtime**: npm may
  warn `EBADENGINE` for a dependency demanding a newer node than the system
  one (e.g. `@opentui/core` wants node ≥ 26), but the plugin executes inside
  opencode's bundled runtime. Treat it as a watch item for post-restart
  verification, not a blocker.
- **Report leftovers you find along the way.** Upgrades are a good moment to
  notice adjacent degradation (e.g. cc-safety-net's vendored-zod warning) —
  surface it in the report, but keep it out of scope unless asked.

#!/usr/bin/env node
// Update opencode plugin @versions in opencode.json config files.
//
// Usage:
//   node update-plugins.mjs [--config <path> | --user | --project | --both]
//                           [--cooldown <days> | --latest] [--default] [--yes]
//                           [--prerelease] [--cache <dir>] [--no-cache-clean]
//                           [--no-install] [--registry <url>]
//
// Scope:
//   --config <path>   one specific opencode.json
//   --user            ~/.config/opencode/opencode.json
//   --project         $PWD/.opencode/opencode.json
//   --both            every one of the above that exists (missing -> notice)
//
// Behavior:
//   - Reads the "plugin" array from each config, fetches each package's npm
//     packument, and resolves the latest eligible version.
//   - With --cooldown <days>, selects the newest version published at least
//     <days> days ago (skips too-fresh releases). Default 0 (no cooldown).
//     --latest is shorthand for --cooldown 0.
//   - --default fills anything unset with the house defaults so the script can
//     run autonomously: scope = --both, cooldown = 7 days, stable releases
//     only, cache cleanup on, pre-install on. Explicit flags always win.
//   - Prerelease versions (e.g. 1.2.3-beta) are excluded unless --prerelease.
//   - Prints a diff of proposed changes. Pass --yes to write files in place
//     and clear the stale plugin cache.
//   - Pre-install (default, --yes mode only): before writing any config,
//     installs every bumped name@version into the plugin cache with a fully
//     controlled npm environment — every ambient NPM_CONFIG_* variable is
//     stripped, userconfig/globalconfig are redirected to an empty file, and
//     registry / min-release-age=0 / ignore-scripts are set explicitly — so
//     this script, not the ambient npmrc, decides what gets installed.
//     opencode's package loader (packages/core/src/npm.ts, Npm.add) skips its
//     own install when <cache>/<entry>/node_modules/<name> already exists, so
//     pre-installed dirs are used verbatim on next start. Layout parity is
//     exact: package.json + package-lock.json + node_modules/<name>. An
//     install failure aborts the run before any config write or cache removal.
//
// Exit codes: 0 success (changes written or nothing to do), 1 on error
// (bad arguments, no config found, unreadable/unparseable config, failed
// pre-install).

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
const REGISTRY = "https://registry.npmjs.org";
// Where opencode stores installed plugin packages, keyed "<name>@<version>"
// (scoped packages nest one level: "<@scope>/<name>@<version>").
const DEFAULT_CACHE = path.join(homedir(), ".cache", "opencode", "packages");

// Standard config locations, resolvable by scope flag.
const CONFIG_PATHS = {
  user: path.join(homedir(), ".config", "opencode", "opencode.json"),
  project: path.join(process.cwd(), ".opencode", "opencode.json"),
};

function printHelp() {
  process.stdout.write(`Usage: node update-plugins.mjs [--config <path> | --user | --project | --both]
                           [--cooldown <days> | --latest] [--default] [--yes]

  --config <path>    Target one specific opencode.json containing a "plugin" array.
  --user             Target the user config: ~/.config/opencode/opencode.json.
  --project          Target the project config: $PWD/.opencode/opencode.json.
  --both             Target every config above that exists (missing ones are reported and skipped).
  --cooldown <days>  Only upgrade to the newest version at least <days> days old. Default 0 (latest).
  --latest           Shorthand for --cooldown 0 (absolute newest stable).
  --default          Non-interactive defaults for anything unset: scope = --both, cooldown = 7 days,
                     stable releases only, cache cleanup on, pre-install on. Explicit flags win.
  --prerelease       Allow prerelease versions (e.g. 1.2.3-beta). Excluded by default.
  --cache <dir>      Plugin cache dir. Default ~/.cache/opencode/packages.
  --no-cache-clean   Skip cache cleanup (leave stale plugin versions in place).
  --no-install       Skip pre-installing bumped plugins into the cache; opencode installs them
                     itself on restart, subject to whatever NPM_CONFIG_* env it was launched with.
  --registry <url>   npm registry used for BOTH version resolution and pre-install.
                     Default https://registry.npmjs.org.
  --yes              Write changes to disk. Without it, only print a diff.
  -h, --help         Show this help.
`);
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {
    config: null,
    scope: null,
    cooldown: 0,
    cooldownSet: false,
    yes: false,
    prerelease: false,
    cache: DEFAULT_CACHE,
    noCacheClean: false,
    noInstall: false,
    registry: REGISTRY,
    defaultMode: false,
  };
  const setScope = (s) => {
    if (out.scope && out.scope !== s) fail("Pick exactly one of --user, --project, --both.");
    out.scope = s;
  };
  const setCooldown = (d) => {
    if (out.cooldownSet && out.cooldown !== d) fail("Pick exactly one of --cooldown <days> / --latest.");
    out.cooldown = d;
    out.cooldownSet = true;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") {
      if (out.scope) fail("--config cannot be combined with --user/--project/--both.");
      out.config = argv[++i];
      if (out.config == null) fail("--config requires a path.");
    } else if (a === "--user") {
      if (out.config) fail("--config cannot be combined with --user/--project/--both.");
      setScope("user");
    } else if (a === "--project") {
      if (out.config) fail("--config cannot be combined with --user/--project/--both.");
      setScope("project");
    } else if (a === "--both") {
      if (out.config) fail("--config cannot be combined with --user/--project/--both.");
      setScope("both");
    } else if (a === "--cooldown") {
      setCooldown(Number(argv[++i]));
    } else if (a === "--latest") {
      setCooldown(0);
    } else if (a === "--default") {
      out.defaultMode = true;
    } else if (a === "--yes") out.yes = true;
    else if (a === "--prerelease") out.prerelease = true;
    else if (a === "--cache") out.cache = argv[++i];
    else if (a === "--no-cache-clean") out.noCacheClean = true;
    else if (a === "--no-install") out.noInstall = true;
    else if (a === "--registry") {
      out.registry = argv[++i];
      if (!out.registry) fail("--registry requires a URL.");
    } else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else {
      fail(`Unknown argument: ${a}`);
    }
  }
  if (!Number.isFinite(out.cooldown) || out.cooldown < 0) {
    fail("--cooldown must be a non-negative number of days");
  }
  // --default fills only what was left unset; explicit flags win.
  if (out.defaultMode) {
    if (out.config == null && out.scope == null) out.scope = "both";
    if (!out.cooldownSet) setCooldown(7);
  }
  if (out.config == null && out.scope == null) {
    fail("Missing scope: pass --config <path> or one of --user/--project/--both (or --default).");
  }
  return out;
}

// Split "name@version" / "@scope/name@version" / "name" into { name, version }.
// The version separator is the LAST "@" (scoped names start with "@").
function splitEntry(entry) {
  const idx = entry.lastIndexOf("@");
  if (idx <= 0) return { name: entry, version: null };
  return { name: entry.slice(0, idx), version: entry.slice(idx + 1) };
}

// Compare two semver-ish strings. Numeric where possible; prerelease tags
// compared lexically. Returns negative / zero / positive.
function cmpVersion(a, b) {
  const pa = String(a).split(/[.+-]/);
  const pb = String(b).split(/[.+-]/);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? "0";
    const y = pb[i] ?? "0";
    const xn = Number(x);
    const yn = Number(y);
    if (!Number.isNaN(xn) && !Number.isNaN(yn)) {
      if (xn !== yn) return xn - yn;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function packumentUrl(name, registry) {
  const base = registry.endsWith("/") ? registry : registry + "/";
  // Encode slashes in scoped names; leading "@" is safe unencoded.
  return base + name.replace(/\//g, "%2F");
}

async function fetchPackument(name, registry) {
  const res = await fetch(packumentUrl(name, registry)); // fetch: configured npm registry only
  if (!res.ok) throw new Error(`npm registry ${res.status} for ${name}`);
  return res.json();
}

// Pick the best version eligible under the cooldown. Returns null if none.
// Stable by default (prereleases excluded). With no cooldown AND no
// --prerelease, trust npm's dist-tags "latest" (the curated current stable).
// With --prerelease, always scan all versions so the absolute newest wins.
function pickTarget(packument, cooldownDays, allowPrerelease) {
  const versions = Object.keys(packument.versions ?? {});
  if (versions.length === 0) return null;

  if (!allowPrerelease && cooldownDays === 0) {
    const latest = packument["dist-tags"]?.latest;
    if (latest && !latest.includes("-")) return latest;
  }

  const times = packument.time ?? {};
  const cutoff = Date.now() - cooldownDays * DAY_MS;
  const eligible = versions.filter((v) => {
    if (!allowPrerelease && v.includes("-")) return false;
    const t = times[v];
    if (!t) return cooldownDays === 0;
    const ms = Date.parse(t);
    return Number.isFinite(ms) && ms <= cutoff;
  });
  if (eligible.length === 0) return null;
  eligible.sort(cmpVersion);
  return eligible[eligible.length - 1];
}

function detectIndent(src) {
  const m = src.match(/\n( +)"/);
  return m ? m[1].length : 2;
}

// List cached install dirs for a plugin name (any version). name may be
// "@scope/pkg" or "pkg". Scoped names live one level deep under "<@scope>/".
// Returns absolute paths like "<cache>/<name>@<ver>" or
// "<cache>/<@scope>/<base>@<ver>". Empty array if the dir is absent.
function cacheEntriesFor(cacheDir, name) {
  let dir = cacheDir;
  let base = name;
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash > 0) {
      dir = path.join(cacheDir, name.slice(0, slash));
      base = name.slice(slash + 1);
    }
  }
  if (!existsSync(dir)) return [];
  const prefix = base + "@";
  return readdirSync(dir)
    .filter((e) => e.startsWith(prefix) && e !== base)
    .map((e) => path.join(dir, e));
}

// Build the fully controlled environment for the pre-install npm process.
// opencode passes its whole process env into npm's config loader
// (packages/core/src/npm-config.ts: env: { ...process.env }), so ambient
// NPM_CONFIG_* values (a userconfig npmrc with min-release-age, registry
// mirrors, proxies, tokens) silently shape plugin installs. To own the
// installation we strip every npm config var and set explicit ones.
// npm precedence: env > project .npmrc > user npmrc > global, so explicit
// env values cannot be overridden by any config file found from cwd upward.
function installEnv(registry, userNpmrc, globalNpmrc) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^npm_config_/i.test(k)) continue; // userconfig indirection, registry, proxies, min-release-age...
    if (k === "NPM_TOKEN") continue; // never forward auth material to a possibly different registry
    env[k] = v;
  }
  // Neutralize the user/global npmrc fallbacks: both point at empty files
  // (npm rejects one file loaded as both roles), so nothing ambient can leak
  // in even for keys we do not set explicitly.
  env.NPM_CONFIG_USERCONFIG = userNpmrc;
  env.NPM_CONFIG_GLOBALCONFIG = globalNpmrc;
  env.NPM_CONFIG_REGISTRY = registry.replace(/\/+$/, "");
  // The cooldown above already decided eligibility; npm must not re-veto.
  env.NPM_CONFIG_MIN_RELEASE_AGE = "0";
  // Parity with opencode's own installer: it hardcodes ignoreScripts: true.
  env.NPM_CONFIG_IGNORE_SCRIPTS = "true";
  // Noise off; nothing else may run or talk.
  env.NPM_CONFIG_UPDATE_NOTIFIER = "false";
  env.NPM_CONFIG_FUND = "false";
  env.NPM_CONFIG_AUDIT = "false";
  return env;
}

// Install name@version into the plugin cache with the controlled env,
// producing the exact layout opencode's Arborist-based installer leaves:
// <cache>/<name>@<version>/{package.json, package-lock.json, node_modules/}.
// opencode's Npm.add fast path checks only <dir>/node_modules/<name>, so a
// pre-installed dir is used verbatim with no network access on restart.
// Returns { dir, skipped } — skipped when the fast-path marker already exists.
function installPlugin(cacheDir, name, version, env) {
  const dir = path.join(cacheDir, `${name}@${version}`);
  const marker = path.join(dir, "node_modules", name);
  if (existsSync(marker)) return { dir, skipped: true };

  // Start clean: a marker-less dir is debris from a failed install (or junk);
  // reinstalling into it could mix trees, so wipe it first.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const manifest = {
    name: "opencode-plugin",
    private: true,
    dependencies: { [name]: version },
  };
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest, null, 2) + "\n");

  // Intentional subprocess: fixed argv, no shell string, controlled env —
  // the execFile-with-explicit-arguments form.
  try {
    execFileSync(
      "npm",
      ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
      { cwd: dir, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (e) {
    if (e.code === "ENOENT") throw new Error(`cannot run npm: ${e.message}`);
    const detail = String(e.stderr ?? e.stdout ?? e.message).trim().split("\n").filter(Boolean).pop() ?? "";
    throw new Error(`npm install ${name}@${version} failed: ${detail}`);
  }
  if (!existsSync(marker)) {
    throw new Error(`npm install ${name}@${version} finished but ${marker} is missing`);
  }
  return { dir, skipped: false };
}

// Resolve which config files to process from --config or the scope flags.
// --both (and --default's implied scope) keep every config that exists and
// report the missing ones; an explicit single scope that is missing is an
// error. Returns config paths.
function resolveConfigs(opts) {
  if (opts.config) return [opts.config];
  const wanted = opts.scope === "both" ? ["user", "project"] : [opts.scope];
  const found = wanted.filter((k) => existsSync(CONFIG_PATHS[k]));
  for (const k of wanted) {
    if (!found.includes(k)) {
      const msg = `${k} config not found: ${CONFIG_PATHS[k]}`;
      if (found.length > 0 || opts.scope === "both") console.log(`Skipping: ${msg}`);
      else fail(msg);
    }
  }
  if (found.length === 0) {
    fail(`No opencode.json found at:\n  ${wanted.map((k) => CONFIG_PATHS[k]).join("\n  ")}`);
  }
  return found.map((k) => CONFIG_PATHS[k]);
}

// Plan one config file: read, parse, and compute the change set WITHOUT
// writing anything. Returns { configPath, status, changes, raw, cfg }:
// status "error" (reported), "clean" (nothing to do), or "ok" (changes
// pending). Prints the per-config report.
async function planConfig(configPath, opts) {
  console.log(`== ${configPath} ==`);

  let raw;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (e) {
    console.error(`Cannot read ${configPath}: ${e.message}`);
    return { configPath, status: "error" };
  }

  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    console.error(`Invalid JSON in ${configPath}: ${e.message}`);
    return { configPath, status: "error" };
  }

  if (!Array.isArray(cfg.plugin) || cfg.plugin.length === 0) {
    console.log(`No "plugin" array in ${configPath}; nothing to do.`);
    return { configPath, status: "clean" };
  }

  const changes = [];
  for (const entry of cfg.plugin) {
    if (typeof entry !== "string") continue;
    const { name, version: current } = splitEntry(entry);
    if (!name) continue;

    let pkg;
    try {
      pkg = await fetchPackument(name, opts.registry);
    } catch (e) {
      console.error(`skip ${name}: ${e.message}`);
      continue;
    }

    const target = pickTarget(pkg, opts.cooldown, opts.prerelease);
    if (!target) {
      console.error(`skip ${name}: no eligible version (cooldown ${opts.cooldown}d)`);
      continue;
    }

    const targetEntry = `${name}@${target}`;
    if (entry === targetEntry) continue;
    if (current && cmpVersion(target, current) <= 0) continue; // never downgrade

    changes.push({
      entry,
      targetEntry,
      name,
      current: current ?? "(unpinned)",
      target,
    });
  }

  if (changes.length === 0) {
    console.log("All plugins up to date.");
    return { configPath, status: "clean" };
  }

  // Stale plugin cache: opencode caches every installed plugin version under
  // <cache>/<name>@<ver>. When the pin in opencode.json changes but the new
  // version isn't fetched yet, opencode falls back to whatever older version
  // is still cached -> the loaded plugin disagrees with the config schema and
  // every agent silently reverts to defaults. With pre-install on, the new
  // version is installed up front; clearing the old dirs is then pure hygiene.
  // The TARGET dirs are excluded: a cached (or partial) <name>@<target> must
  // never be counted as stale — deleting the dir we just installed (or are
  // about to reuse via the fast path) would undo the pre-install.
  const targetDirs = new Set(changes.map((c) => path.resolve(opts.cache, c.targetEntry)));
  const staleCacheDirs = opts.noCacheClean
    ? []
    : [...new Set(changes.flatMap((c) => cacheEntriesFor(opts.cache, c.name)))].filter(
        (d) => !targetDirs.has(path.resolve(d)),
      );

  const tag = opts.cooldown > 0 ? ` (cooldown ${opts.cooldown}d)` : " (latest)";
  console.log(`Proposed changes${tag}:`);
  for (const c of changes) {
    console.log(`  ${c.name}: ${c.current} -> ${c.target}`);
  }
  if (!opts.noInstall) {
    console.log(
      `\nPre-install into cache (controlled npm env: registry=${opts.registry}, min-release-age=0, ignore-scripts, userconfig neutralized):`,
    );
    for (const c of changes) {
      console.log(`  ${path.join(opts.cache, c.targetEntry)}`);
    }
  }
  if (opts.noCacheClean) {
    console.log("\nCache cleanup skipped (--no-cache-clean).");
  } else if (staleCacheDirs.length > 0) {
    console.log("\nStale cache dirs to remove:");
    for (const d of staleCacheDirs) console.log(`  ${d}`);
  } else {
    console.log("\nNo stale cache entries found for bumped plugins.");
  }

  return { configPath, status: "ok", changes, staleCacheDirs, raw, cfg };
}

// Apply a plan: write the config back (preserving key order, detected
// indentation, trailing newline) and remove the stale cache dirs. Only runs
// after every pre-install succeeded.
function applyConfig(plan, opts) {
  const { configPath, changes, staleCacheDirs, raw, cfg } = plan;
  const indent = " ".repeat(detectIndent(raw));
  const hadTrailingNewline = /\n$/.test(raw);
  cfg.plugin = cfg.plugin.map(
    (entry) => changes.find((c) => c.entry === entry)?.targetEntry ?? entry
  );
  const out = JSON.stringify(cfg, null, indent) + (hadTrailingNewline ? "\n" : "");
  writeFileSync(configPath, out);
  console.log(`Wrote ${configPath}.`);

  for (const d of staleCacheDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
      console.log(`Removed stale cache ${d}`);
    } catch (e) {
      console.error(`Failed to remove ${d}: ${e.message}`);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const configs = resolveConfigs(opts);

  let anyError = false;
  const plans = [];
  for (let i = 0; i < configs.length; i++) {
    if (i > 0) console.log("");
    const plan = await planConfig(configs[i], opts);
    plans.push(plan);
    if (plan.status === "error") anyError = true;
  }
  const actionable = plans.filter((p) => p.status === "ok");

  if (actionable.length > 0 && !opts.yes) {
    console.log("\nDry run. Re-run with --yes to apply.");
    if (anyError) process.exit(1);
    return;
  }

  if (anyError) process.exitCode = 1;
  if (actionable.length === 0) return;

  // Pre-install phase: additive only — new dirs land beside the old cached
  // versions, nothing is removed or rewritten yet. A failure here aborts
  // before any config write or cache removal, so a working install is never
  // traded for a pin opencode can't fetch under its ambient env.
  let installed = false;
  if (!opts.noInstall) {
    const pending = new Map();
    for (const p of actionable) for (const c of p.changes) pending.set(c.targetEntry, c);

    const emptyUserNpmrc = path.join(tmpdir(), `update-opencode-plugins-user-npmrc-${process.pid}`);
    const emptyGlobalNpmrc = path.join(tmpdir(), `update-opencode-plugins-global-npmrc-${process.pid}`);
    writeFileSync(emptyUserNpmrc, "");
    writeFileSync(emptyGlobalNpmrc, "");
    try {
      const env = installEnv(opts.registry, emptyUserNpmrc, emptyGlobalNpmrc);
      const failed = [];
      console.log("");
      for (const c of pending.values()) {
        try {
          const { dir, skipped } = installPlugin(opts.cache, c.name, c.target, env);
          console.log(
            skipped
              ? `Cache already has ${c.targetEntry} (${dir}); skipping install`
              : `Pre-installed ${c.targetEntry} -> ${dir}`,
          );
        } catch (e) {
          console.error(`Pre-install failed for ${c.targetEntry}: ${e.message}`);
          failed.push(c.targetEntry);
        }
      }
      if (failed.length > 0) {
        console.error(
          "\nAborted before writing anything: no configs changed, no cache dirs removed.\n" +
            "Fix the failures above, or re-run with --no-install to let opencode install on restart.",
        );
        process.exit(1);
      }
      installed = true;
    } finally {
      for (const f of [emptyUserNpmrc, emptyGlobalNpmrc]) {
        try {
          rmSync(f, { force: true });
        } catch {
          // best effort: tmpdir housekeeping
        }
      }
    }
  }

  for (let i = 0; i < actionable.length; i++) {
    if (i > 0 || installed) console.log("");
    applyConfig(actionable[i], opts);
  }

  if (installed) {
    console.log("\nRestart opencode; it picks up the pre-installed versions directly (cache fast path, no re-resolve).");
  } else {
    console.log("\nRestart opencode to re-resolve and load the new plugin versions.");
  }
  if (anyError) process.exit(1);
}

main().catch((e) => {
  console.error(e?.message ?? String(e));
  process.exit(1);
});

#!/usr/bin/env node
// Update opencode plugin @versions in an opencode.json config file.
//
// Usage:
//   node update-plugins.mjs --config <path> [--cooldown <days>] [--yes]
//
// - Reads the "plugin" array from the given opencode.json.
// - Fetches each package's npm packument to resolve the latest version.
// - With --cooldown <days>, selects the newest version published at least
//   <days> days ago (skips too-fresh releases). Default: 0 (no cooldown).
// - Prerelease versions (e.g. 1.2.3-beta) are excluded unless --prerelease is
//   passed. With no cooldown, the target is npm's dist-tags "latest".
// - Prints a diff of proposed changes. Pass --yes to write the file in place.
//
// Exit codes: 0 success (changes written or nothing to do), 1 on error.

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
const REGISTRY = "https://registry.npmjs.org/";
// Where opencode stores installed plugin packages, keyed "<name>@<version>"
// (scoped packages nest one level: "<@scope>/<name>@<version>").
const DEFAULT_CACHE = path.join(homedir(), ".cache", "opencode", "packages");

function printHelp() {
  process.stdout.write(`Usage: node update-plugins.mjs --config <path> [--cooldown <days>] [--yes]

  --config <path>    Path to an opencode.json containing a "plugin" array.
  --cooldown <days>  Only upgrade to the newest version at least <days> days old. Default 0 (latest).
  --prerelease       Allow prerelease versions (e.g. 1.2.3-beta). Excluded by default.
  --cache <dir>      Plugin cache dir to clear of stale versions. Default ~/.cache/opencode/packages.
  --no-cache-clean   Skip cache cleanup (leave stale plugin versions in place).
  --yes              Write changes to disk. Without it, only print a diff.
  -h, --help         Show this help.
`);
}

function parseArgs(argv) {
  const out = { config: null, cooldown: 0, yes: false, prerelease: false, cache: DEFAULT_CACHE, noCacheClean: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") out.config = argv[++i];
    else if (a === "--cooldown") out.cooldown = Number(argv[++i]);
    else if (a === "--yes") out.yes = true;
    else if (a === "--prerelease") out.prerelease = true;
    else if (a === "--cache") out.cache = argv[++i];
    else if (a === "--no-cache-clean") out.noCacheClean = true;
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  if (out.config == null) {
    console.error("Missing required --config <path>");
    process.exit(1);
  }
  if (!Number.isFinite(out.cooldown) || out.cooldown < 0) {
    console.error("--cooldown must be a non-negative number of days");
    process.exit(1);
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

function packumentUrl(name) {
  // Encode slashes in scoped names; leading "@" is safe unencoded.
  return REGISTRY + name.replace(/\//g, "%2F");
}

async function fetchPackument(name) {
  const res = await fetch(packumentUrl(name));
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let raw;
  try {
    raw = readFileSync(opts.config, "utf8");
  } catch (e) {
    console.error(`Cannot read ${opts.config}: ${e.message}`);
    process.exit(1);
  }

  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    console.error(`Invalid JSON in ${opts.config}: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(cfg.plugin) || cfg.plugin.length === 0) {
    console.error(`No "plugin" array found in ${opts.config}`);
    process.exit(1);
  }

  const changes = [];
  for (const entry of cfg.plugin) {
    if (typeof entry !== "string") continue;
    const { name, version: current } = splitEntry(entry);
    if (!name) continue;

    let pkg;
    try {
      pkg = await fetchPackument(name);
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
    return;
  }

  // Stale plugin cache: opencode caches every installed plugin version under
  // <cache>/<name>@<ver>. When the pin in opencode.json changes but the new
  // version isn't fetched yet, opencode falls back to whatever older version
  // is still cached -> the loaded plugin disagrees with the config schema and
  // every agent silently reverts to defaults. Clearing all cached versions of
  // each bumped plugin forces a clean re-resolve on next start.
  const staleCacheDirs = opts.noCacheClean
    ? []
    : [...new Set(changes.flatMap((c) => cacheEntriesFor(opts.cache, c.name)))];

  const tag = opts.cooldown > 0 ? ` (cooldown ${opts.cooldown}d)` : " (latest)";
  console.log(`Proposed changes${tag}:`);
  for (const c of changes) {
    console.log(`  ${c.name}: ${c.current} -> ${c.target}`);
  }
  if (opts.noCacheClean) {
    console.log("\nCache cleanup skipped (--no-cache-clean).");
  } else if (staleCacheDirs.length > 0) {
    console.log("\nStale cache dirs to remove:");
    for (const d of staleCacheDirs) console.log(`  ${d}`);
  } else {
    console.log("\nNo stale cache entries found for bumped plugins.");
  }

  if (!opts.yes) {
    console.log("\nDry run. Re-run with --yes to apply.");
    return;
  }

  const indent = " ".repeat(detectIndent(raw));
  const hadTrailingNewline = /\n$/.test(raw);
  cfg.plugin = cfg.plugin.map(
    (entry) => changes.find((c) => c.entry === entry)?.targetEntry ?? entry
  );
  const out = JSON.stringify(cfg, null, indent) + (hadTrailingNewline ? "\n" : "");
  writeFileSync(opts.config, out);
  console.log(`Wrote ${opts.config}.`);

  for (const d of staleCacheDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
      console.log(`Removed stale cache ${d}`);
    } catch (e) {
      console.error(`Failed to remove ${d}: ${e.message}`);
    }
  }

  console.log("Restart opencode to re-resolve and load the new plugin versions.");
}

main().catch((e) => {
  console.error(e?.message ?? String(e));
  process.exit(1);
});

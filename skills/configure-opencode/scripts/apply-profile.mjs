#!/usr/bin/env node
// configure-opencode: defaults-profile helper.
//   --init   snapshot a live opencode config dir into a defaults profile
//   (apply)  replay the profile onto a config dir — dry-run unless --apply
// Zero external dependencies; Node 18+.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const KNOWN_PLUGIN_CONFIGS = ["dcp.json", "opencode-mem.jsonc"];

function usage() {
  return [
    "Usage: apply-profile.mjs [--init | (apply mode)] [options]",
    "",
    "Modes:",
    "  (default)  Apply the profile onto the target config dir (dry-run plan",
    "             unless --apply is passed).",
    "  --init     Snapshot the live config dir into the profile. Refuses to",
    "             overwrite an existing profile.json unless --force.",
    "",
    "Options:",
    "  --profile <dir>  Profile directory. Default: ~/.config/opencode/bootstrap",
    "  --dir <dir>      Live/target opencode config dir.",
    "                   Default: ~/.config/opencode",
    "  --apply          Actually write (apply mode only). Dry-run without it.",
    "  --force          With --init: overwrite an existing profile.",
    "  -h, --help       Show this help.",
    "",
    "Profile layout:",
    "  <profile>/profile.json     { opencode, tui, secrets } — config partials",
    "  <profile>/plugin-configs/  verbatim plugin config files (JSONC kept)",
    "  <profile>/themes/          verbatim theme JSON files",
  ].join("\n");
}

function die(msg, code = 1) {
  process.stderr.write(`apply-profile: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { apply: false, init: false, force: false, help: false };
  const paths = { profile: null, dir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (i + 1 < argv.length ? argv[++i] : die(`missing value for ${a}`));
    if (a === "--apply") out.apply = true;
    else if (a === "--init") out.init = true;
    else if (a === "--force") out.force = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else if (a === "--profile") paths.profile = next();
    else if (a === "--dir") paths.dir = next();
    else die(`unknown argument: ${a}`);
  }
  return { ...out, ...paths };
}

// --- JSON / JSONC -----------------------------------------------------------

// Strips // and /* */ comments outside strings. Used only to PARSE for
// merging — verbatim copies never pass through here, so user comments in
// .jsonc files are always preserved on disk.
function stripJsonc(text) {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const c = text[i];
    const c2 = text.slice(i, i + 2);
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? die("unterminated escape in JSONC");
      else if (c === '"') inString = false;
      i++;
    } else if (c === '"') {
      inString = true;
      out += c;
      i++;
    } else if (c2 === "//") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c2 === "/*") {
      i += 2;
      while (i < text.length && text.slice(i, i + 2) !== "*/") i++;
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function readConfig(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const body = stripJsonc(raw);
  try {
    return { raw, obj: JSON.parse(body) };
  } catch (e) {
    return { raw, error: e };
  }
}

function serialize(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

// --- merge semantics --------------------------------------------------------
// Objects deep-merge, profile wins on conflicts. The `plugin` array is a
// union keyed by package name with the profile pin winning; every other
// array is replaced by the profile's value (a defaults profile states the
// whole value it cares about).

function pluginName(entry) {
  const spec = Array.isArray(entry) ? entry[0] : entry;
  if (typeof spec !== "string") return null;
  const m = spec.match(/^(@[^/@]+\/[^/@]+|[^/@][^@]*?)(?:@[^@]+)?$/);
  return m ? m[1] : spec;
}

function mergeValue(target, partial, key) {
  if (key === "plugin" && Array.isArray(target) && Array.isArray(partial)) {
    const merged = [...target];
    for (const entry of partial) {
      const name = pluginName(entry);
      const idx = merged.findIndex((t) => pluginName(t) === name);
      if (idx >= 0) merged[idx] = entry;
      else merged.push(entry);
    }
    return merged;
  }
  if (Array.isArray(partial) || partial === null || typeof partial !== "object") {
    return partial;
  }
  if (target === null || typeof target !== "object" || Array.isArray(target)) {
    return mergeObjects({}, partial);
  }
  return mergeObjects(target, partial);
}

function mergeObjects(target, partial) {
  const out = { ...target };
  for (const [k, v] of Object.entries(partial)) out[k] = mergeValue(out[k], v, k);
  return out;
}

// --- secrets ----------------------------------------------------------------

function collectRefs(value, refs) {
  if (typeof value === "string") {
    for (const m of value.matchAll(/\b(file|env):\/\/[^\s"'`]+/g)) refs.add(m[0]);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectRefs(v, refs));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectRefs(v, refs));
  }
}

// --- shared -----------------------------------------------------------------

function backup(file) {
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  const bak = `${file}.bak-${ts}`;
  copyFileSync(file, bak);
  return bak;
}

function findConfigFile(dir, base) {
  for (const name of [`${base}.jsonc`, `${base}.json`]) {
    const p = path.join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function copyTree(src, dst, { plan, apply }) {
  const wrote = [];
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    const exists = existsSync(to);
    const same = exists && readFileSync(from).equals(readFileSync(to));
    if (same) continue;
    plan.push(`${exists ? "overwrite (backup first)" : "create"} ${to} <- ${from}`);
    if (apply) {
      mkdirSync(dst, { recursive: true });
      if (exists) backup(to);
      copyFileSync(from, to);
      wrote.push(to);
    }
  }
  return wrote;
}

// --- init -------------------------------------------------------------------

function cmdInit(dir, profileDir, force) {
  const profileFile = path.join(profileDir, "profile.json");
  if (existsSync(profileFile) && !force) {
    die(`profile already exists: ${profileFile} (use --force to overwrite)`);
  }

  const mainFile = findConfigFile(dir, "opencode");
  const tuiFile = findConfigFile(dir, "tui");
  if (!mainFile && !tuiFile) die(`no opencode.json(c)/tui.json(c) found in ${dir}`);

  const opencode = mainFile ? readConfig(mainFile) : null;
  const tui = tuiFile ? readConfig(tuiFile) : null;
  for (const [label, parsed] of [
    ["opencode config", opencode],
    ["tui config", tui],
  ]) {
    if (parsed && parsed.error) die(`cannot parse ${label} (${parsed.error.message}) — profile must be machine-readable`);
  }

  const refs = new Set();
  if (opencode?.obj) collectRefs(opencode.obj, refs);
  if (tui?.obj) collectRefs(tui.obj, refs);

  mkdirSync(path.join(profileDir, "plugin-configs"), { recursive: true });
  mkdirSync(path.join(profileDir, "themes"), { recursive: true });

  const copied = [];
  for (const name of KNOWN_PLUGIN_CONFIGS) {
    const src = path.join(dir, name);
    if (existsSync(src)) {
      copyFileSync(src, path.join(profileDir, "plugin-configs", name));
      collectRefs(readConfig(src)?.obj ?? {}, refs);
      copied.push(name);
    }
  }
  const themesDir = path.join(dir, "themes");
  if (existsSync(themesDir)) {
    for (const f of readdirSync(themesDir)) {
      if (f.endsWith(".json")) {
        copyFileSync(path.join(themesDir, f), path.join(profileDir, "themes", f));
        copied.push(`themes/${f}`);
      }
    }
  }

  const profile = {
    ...(opencode?.obj ? { opencode: opencode.obj } : {}),
    ...(tui?.obj ? { tui: tui.obj } : {}),
    secrets: [...refs].sort(),
  };
  writeFileSync(profileFile, serialize(profile));

  process.stdout.write(
    [
      `Profile written: ${profileFile}`,
      `  opencode partial: ${mainFile ?? "(absent)"}`,
      `  tui partial:      ${tuiFile ?? "(absent)"}`,
      `  verbatim copies:  ${copied.length ? copied.join(", ") : "(none)"}`,
      `  secret refs:      ${refs.size ? [...refs].join(", ") : "(none found)"}`,
      "",
      "NOTE: profile.json re-serializes configs (comments dropped there);",
      "plugin-configs/ files are copied verbatim with comments intact.",
      "Keep this profile private — it mirrors your real configuration.",
    ].join("\n") + "\n",
  );
}

// --- apply ------------------------------------------------------------------

function cmdApply(dir, profileDir, apply) {
  const profileFile = path.join(profileDir, "profile.json");
  if (!existsSync(profileFile)) {
    die(`no profile at ${profileFile} — run with --init first`);
  }
  const profile = readConfig(profileFile);
  if (profile?.error) die(`cannot parse profile.json (${profile.error.message})`);

  const plan = [];
  const partials = [
    ["opencode", profile.obj.opencode, "opencode"],
    ["tui", profile.obj.tui, "tui"],
  ];
  for (const [label, partial, base] of partials) {
    if (!partial) continue;
    const target = findConfigFile(dir, base) ?? path.join(dir, `${base}.json`);
    const existing = readConfig(target);
    if (existing?.error) {
      die(`cannot parse existing ${target} (${existing.error.message}) — fix or remove it first`);
    }
    const merged = mergeObjects(existing?.obj ?? {}, partial);
    const next = serialize(merged);
    if (existing && existing.raw === next) continue;
    plan.push(`${existing ? "merge (backup first)" : "create"} ${target}`);
    if (apply) {
      mkdirSync(dir, { recursive: true });
      if (existing) backup(target);
      writeFileSync(target, next);
    }
  }

  for (const sub of ["plugin-configs", "themes"]) {
    const src = path.join(profileDir, sub);
    if (existsSync(src)) copyTree(src, path.join(dir, sub === "plugin-configs" ? "." : "themes"), { plan, apply });
  }

  const mode = apply ? "APPLIED" : "DRY RUN (pass --apply to write)";
  process.stdout.write(
    [
      `Defaults profile → ${dir}  [${mode}]`,
      ...(plan.length ? plan.map((l) => `  ${l}`) : ["  (no changes needed)"]),
      "",
    ].join("\n") + "\n",
  );

  const refs = Array.isArray(profile.obj.secrets) ? profile.obj.secrets : [];
  if (refs.length) {
    process.stdout.write(
      [
        "Manual secret steps (contents are never copied):",
        ...refs.map((r) => `  - place/verify ${r}`),
        "",
      ].join("\n") + "\n",
    );
  }
  process.stdout.write(
    [
      "Next: restart opencode, then verify with `opencode debug config`.",
      "Plugin pins added by the profile install into the version-keyed cache",
      "on first start (see reference/opencode-config-reference.md).",
      "",
    ].join("\n") + "\n",
  );
  if (!apply && plan.length) process.exitCode = 2;
}

// --- main -------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(usage() + "\n");
  process.exit(0);
}
const home = process.env.HOME || die("HOME not set");
const dir = path.resolve(args.dir ?? path.join(home, ".config", "opencode"));
const profileDir = path.resolve(args.profile ?? path.join(home, ".config", "opencode", "bootstrap"));

if (args.init) cmdInit(dir, profileDir, args.force);
else cmdApply(dir, profileDir, args.apply);

#!/usr/bin/env node
// Reinstall the global (~/.agents/skills) skill set via the skills CLI.
//
// Usage:
//   node scripts/restore-skills.mjs [--dry-run] [--help]
//
// Behavior:
//   - Reads the global skill set from scripts/global-skills.json and
//     replays one `skills add <source> -g -y -a '*' --skill ...` per
//     entry. Keep that file in sync with `skills ls -g` when installing
//     or removing global skills.
//   - Installs from upstream HEAD (no pins). Run `skills update -g` for
//     routine refreshes; pin a source as `owner/repo@<ref>` here if a
//     deterministic restore is ever needed.
//   - Ensures the skills CLI is available: if `skills` is not on PATH, it
//     runs `npm install -g skills` first. Requires node/npm (any toolbox
//     image with the nodejs packages qualifies).
//   - Continues past failed entries and exits 1 if any failed, so a re-run
//     repairs only what broke (adds are idempotent).
//   - --dry-run prints the commands instead of executing them.
//
// Exit codes: 0 success (or dry run), 1 on error (bad arguments, no
// node/npm, one or more installs failed).

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DATA_PATH = new URL("./global-skills.json", import.meta.url);

function loadSources() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  } catch (error) {
    fail(`cannot read ${DATA_PATH.pathname}: ${error.message}`);
  }
  if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
    fail(`${DATA_PATH.pathname} must contain a non-empty "sources" array`);
  }
  for (const entry of parsed.sources) {
    if (
      typeof entry.source !== "string" ||
      entry.source.length === 0 ||
      !Array.isArray(entry.skills) ||
      entry.skills.length === 0 ||
      entry.skills.some((s) => typeof s !== "string" || s.length === 0)
    ) {
      fail(`invalid sources entry: ${JSON.stringify(entry)}`);
    }
  }
  return parsed.sources;
}

function usage() {
  console.log("Usage: node scripts/restore-skills.mjs [--dry-run] [--help]");
}

function onPath(binary) {
  const probe = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return probe.error === undefined;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function ensureSkillsCli(dryRun) {
  if (onPath("skills")) return;
  if (!onPath("npm")) {
    fail("npm not found -- run inside a toolbox with the nodejs packages");
  }
  console.log("skills CLI not found; installing via npm install -g skills");
  if (dryRun) return;
  const install = spawnSync("npm", ["install", "--global", "skills"], {
    stdio: "inherit",
  });
  if (install.status !== 0 || !onPath("skills")) {
    fail("npm install -g skills did not yield a working skills CLI");
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    console.log("See the header comment in this script for full behavior.");
    return;
  }
  const dryRun = args.includes("--dry-run");
  const unknown = args.filter((a) => a !== "--dry-run");
  if (unknown.length > 0) fail(`unknown argument(s): ${unknown.join(" ")}`);

  ensureSkillsCli(dryRun);

  const sources = loadSources();
  const failed = [];
  for (const { source, skills } of sources) {
    const argv = [
      "add",
      source,
      "--global",
      "--yes",
      "--agent",
      "*",
      "--skill",
      ...skills,
    ];
    console.log(`\n>>> skills ${argv.join(" ")}`);
    if (dryRun) continue;
    const result = spawnSync("skills", argv, { stdio: "inherit" });
    if (result.status !== 0) failed.push(source);
  }

  console.log(
    dryRun
      ? "\ndry run complete"
      : `\ndone: ${sources.length - failed.length}/${sources.length} sources ok`,
  );
  if (failed.length > 0) fail(`failed sources: ${failed.join(", ")}`);
}

main();

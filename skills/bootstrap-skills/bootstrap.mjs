#!/usr/bin/env node
// Install project-scoped agent skills into the CURRENT project via the skills
// CLI, the portable way: GitHub sources only, `.agents/` gitignored, a
// committable skills-lock.json at the repo root, verified installs.
//
// Usage:
//   node bootstrap.mjs [--skills a,b] [--community owner/repo@skill,...]
//                      [--source tankdonut/skills[@ref]] [--agent opencode|'*']
//                      [--no-gitignore] [--dry-run] [--help]
//
// Behavior:
//   - Judgment (which skills) belongs to the agent; this helper only executes.
//   - Preflight: lists installed skills via `skills ls --json` so already
//     installed skills are skipped and reported as pre-existing.
//   - House skills install in ONE `skills add <source> --skill ... --agent
//     <agent> -y` from the GitHub source. Local clone paths are never used:
//     the lock records the source verbatim and a local path is not portable
//     across machines (sourceType "local" with an absolute path).
//   - Community skills install one `skills add owner/repo@skill --agent
//     <agent> -y` per spec.
//   - Ensures `.agents/` is gitignored: appends to .gitignore (creating it if
//     missing, preserving the trailing newline). skills-lock.json is the
//     shared artifact; teammates rebuild .agents/ via
//     `skills experimental_install`.
//   - Verifies with `skills ls --json`; reports installed / pre-existing /
//     failed and exits 1 when any requested skill is missing afterward.
//   - Uses `skills` from PATH when available, else `npx --yes skills`
//     (Node 18+ required either way).
//   - --dry-run prints the commands and the planned .gitignore edit only.
//
// Exit codes: 0 success (or dry run), 1 on error (bad arguments, no usable
// skills CLI, one or more skills failed verification).
//
// All subprocess calls go through run(): execFileSync with an explicit
// arguments array, never a shell string.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const DEFAULT_SOURCE = "tankdonut/skills";
const COMMUNITY_SPEC = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(
    [
      "Usage: node bootstrap.mjs [--skills a,b] [--community owner/repo@skill,...]",
      "                          [--source tankdonut/skills[@ref]] [--agent opencode|'*']",
      "                          [--no-gitignore] [--dry-run] [--help]",
      "",
      "At least one of --skills / --community is required. See the header comment",
      "in this script for full behavior.",
    ].join("\n"),
  );
}

function parseOptions() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        skills: { type: "string", default: "" },
        community: { type: "string", default: "" },
        source: { type: "string", default: DEFAULT_SOURCE },
        agent: { type: "string", default: "opencode" },
        noGitignore: { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    fail(error.message);
  }

  const house = values.skills
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const communityRaw = values.community
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!values.help) {
    for (const spec of communityRaw) {
      if (!COMMUNITY_SPEC.test(spec)) {
        fail(`bad community spec "${spec}" — expected owner/repo@skill`);
      }
    }
    if (house.length === 0 && communityRaw.length === 0) {
      usage();
      fail("nothing requested: pass --skills and/or --community");
    }
  }
  return { ...values, house, communityRaw };
}

// Run cmd with an explicit argument list (no shell). Returns
// { status, stdout }; a missing binary maps to status 127.
function run(cmd, args, inherit) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: inherit ? "inherit" : "pipe",
    });
    return { status: 0, stdout: typeof stdout === "string" ? stdout : "" };
  } catch (error) {
    if (error.code === "ENOENT") return { status: 127, stdout: "" };
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
    };
  }
}

function resolveBin(dryRun) {
  if (run("skills", ["--version"]).status === 0) {
    return { cmd: "skills", prefix: [] };
  }
  if (run("npx", ["--yes", "skills", "--version"]).status === 0) {
    return { cmd: "npx", prefix: ["--yes", "skills"] };
  }
  if (dryRun) return { cmd: "skills", prefix: [] };
  fail("no usable skills CLI: install it (npm install -g skills) or use npx (Node 18+)");
}

function runSkills(bin, args, inherit) {
  return run(bin.cmd, [...bin.prefix, ...args], inherit);
}

function listInstalled(bin) {
  const result = runSkills(bin, ["ls", "--json"]);
  if (result.status !== 0) {
    console.error("warning: skills ls --json failed; assuming nothing installed");
    return new Set();
  }
  try {
    const start = result.stdout.indexOf("[");
    const end = result.stdout.lastIndexOf("]");
    const entries = JSON.parse(result.stdout.slice(start, end + 1));
    // Global (~/.agents/skills) entries can appear in unscoped listings; a
    // project bootstrap must only consider project-scoped installs.
    return new Set(entries.filter((e) => e.scope === "project").map((e) => e.name));
  } catch {
    console.error("warning: could not parse skills ls --json output; assuming nothing installed");
    return new Set();
  }
}

function agentsEntryPresent(content) {
  return content
    .split("\n")
    .some((line) => {
      const t = line.trim();
      return t === ".agents" || t === ".agents/" || t === "/.agents" || t === "/.agents/";
    });
}

function ensureAgentsIgnored(dryRun) {
  const path = ".gitignore";
  if (!existsSync(path)) {
    if (dryRun) {
      console.log("gitignore: would create .gitignore containing '.agents/'");
      return;
    }
    writeFileSync(path, ".agents/\n");
    console.log("gitignore: created .gitignore with '.agents/'");
    return;
  }
  const content = readFileSync(path, "utf8");
  if (agentsEntryPresent(content)) {
    console.log("gitignore: .agents/ already ignored");
    return;
  }
  const addition = (content.endsWith("\n") || content.length === 0 ? "" : "\n") + ".agents/\n";
  if (dryRun) {
    console.log("gitignore: would append '.agents/' to .gitignore");
    return;
  }
  writeFileSync(path, content + addition);
  console.log("gitignore: appended '.agents/' to .gitignore");
}

function main() {
  const opts = parseOptions();
  if (opts.help) {
    usage();
    return;
  }
  const dryRun = opts["dry-run"];
  const bin = resolveBin(dryRun);

  if (run("git", ["rev-parse", "--is-inside-work-tree"]).status !== 0) {
    console.error("warning: not a git work tree — skills-lock.json will still be written, but there is nothing to commit");
  }

  // Community specs whose skill name collides with a house skill: house wins.
  const community = [];
  for (const spec of opts.communityRaw) {
    const name = spec.split("@").pop();
    if (opts.house.includes(name)) {
      console.error(`warning: community spec "${spec}" collides with house skill "${name}" — keeping house version`);
      continue;
    }
    community.push({ spec, name });
  }

  const preInstalled = listInstalled(bin);
  const houseToInstall = opts.house.filter((s) => !preInstalled.has(s));
  const communityToInstall = community.filter((c) => !preInstalled.has(c.spec.split("@").pop()));

  const commands = [];
  if (houseToInstall.length > 0) {
    commands.push(["add", opts.source, "--skill", ...houseToInstall, "--agent", opts.agent, "-y"]);
  }
  for (const c of communityToInstall) {
    commands.push(["add", c.spec, "--agent", opts.agent, "-y"]);
  }
  if (commands.length === 0) {
    console.log("nothing to install — every requested skill is already installed");
  }

  const failedRuns = [];
  for (const args of commands) {
    console.log(`\n>>> ${bin.cmd} ${[...bin.prefix, ...args].join(" ")}`);
    if (dryRun) continue;
    const result = runSkills(bin, args, true);
    if (result.status !== 0) failedRuns.push(args.join(" "));
  }

  if (!opts.noGitignore) ensureAgentsIgnored(dryRun);

  const postInstalled = dryRun ? preInstalled : listInstalled(bin);
  const report = (name) => {
    if (postInstalled.has(name)) {
      return preInstalled.has(name) ? "pre-existing" : "installed";
    }
    return dryRun ? "planned" : "FAILED";
  };

  const rows = [
    ...opts.house.map((name) => ({ name, kind: "house", status: report(name) })),
    ...community.map((c) => ({ name: c.name, kind: `community ${c.spec}`, status: report(c.name) })),
  ];
  console.log("\nSkill report:");
  for (const row of rows) {
    console.log(`  ${row.status.padEnd(12)} ${row.name}  (${row.kind})`);
  }
  console.log(
    dryRun
      ? "\ndry run complete"
      : "\ncommit skills-lock.json (not .agents/); teammates restore with: skills experimental_install",
  );

  const missing = rows.filter((r) => r.status === "FAILED");
  if (failedRuns.length > 0) console.error(`failed commands: ${failedRuns.join(" ; ")}`);
  if (missing.length > 0) fail(`skills missing after install: ${missing.map((m) => m.name).join(", ")}`);
}

main();

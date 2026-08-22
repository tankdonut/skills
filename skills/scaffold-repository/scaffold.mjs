#!/usr/bin/env node
// scaffold.mjs — scaffold a new tankdonut-conventional repository.
//
// Zero external dependencies; requires Node 18+. Writes the deterministic
// house files for one of two archetypes (python-uv, go). Judgment files
// (AGENTS.md, README.md bodies) are emitted as skeletons with TODO markers —
// the invoking agent fills them.
//
// Templates are mined from the tankdonut repositories:
//   python-uv: telentfy (pyproject/ruff/pre-commit), tools (CI, renovate),
//              skills (.markdownlint-cli2.yaml, .gitignore extras)
//   go:        trade-agent (go.mod, .golangci.yml, pre-commit, .tool-versions)

import { mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";

const PRE_COMMIT_HOOKS_REV = "v6.0.0";
const RUFF_REV = "v0.12.4";
const UV_REV = "0.11.28";
const MARKDOWNLINT_REV = "v0.22.1";
const GOLANGCI_REV = "v2.12.2";
const PRE_COMMIT_VERSION = "4.6.2";

function usage() {
  return `Usage: node scaffold.mjs --dir <target> --archetype <python-uv|go> --description <text> [options]

Scaffold a new repository with the tankdonut house conventions.

Required:
  --dir <path>            Target directory. Must not exist, or exist empty.
  --archetype <name>      python-uv | go
  --description <text>    One-line project description (README/AGENTS/pyproject)

Optional:
  --name <name>           Repo/package name (default: dir basename; lowercase,
                          letters/digits/hyphens, must start with a letter)
  --python-version <v>    Python pin (default: 3.14.2)
  --go-version <v>        Go pin (default: 1.26.6)
  --dry-run               Print the file list without writing anything
  -h, --help              Show this help`;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parse() {
  let args;
  try {
    args = parseArgs({
      options: {
        dir: { type: "string" },
        archetype: { type: "string" },
        description: { type: "string" },
        name: { type: "string" },
        "python-version": { type: "string", default: "3.14.2" },
        "go-version": { type: "string", default: "1.26.6" },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (err) {
    fail(err.message);
  }
  if (args.values.help) {
    console.log(usage());
    process.exit(0);
  }
  for (const flag of ["dir", "archetype", "description"]) {
    if (!args.values[flag]) fail(`--${flag} is required (see --help)`);
  }
  if (!["python-uv", "go"].includes(args.values.archetype)) {
    fail(`--archetype must be python-uv or go, got: ${args.values.archetype}`);
  }
  return args.values;
}

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function pythonIdentifier(name) {
  const ident = name.replaceAll("-", "_");
  if (!/^[a-z][a-z0-9_]*$/.test(ident) || ["test", "tests", "src"].includes(ident)) {
    fail(`name "${name}" cannot become a valid Python package name`);
  }
  return ident;
}

// --- Shared templates -------------------------------------------------------

const markdownlintCli2 = `config:
  default: true
  MD013:
    line_length: 120
    code_blocks: false
    tables: false
  MD024:
    siblings_only: true
  MD033: false
  MD041: false
  MD060: false

ignores:
  - ".omo/**"
  - ".worktrees/**"
`;

const renovateJson = `${JSON.stringify(
  {
    $schema: "https://docs.renovatebot.com/renovate-schema.json",
    extends: ["config:recommended"],
    minimumReleaseAge: "7 days",
    platformAutomerge: true,
    automergeStrategy: "squash",
    packageRules: [
      {
        description: "Automerge non-major updates after passing CI and approval.",
        matchUpdateTypes: ["minor", "patch", "pin", "digest"],
        automerge: true,
      },
      {
        description: "Automerge development dependencies.",
        matchDepTypes: ["devDependencies"],
        automerge: true,
      },
      {
        description: "Major updates require manual review.",
        matchUpdateTypes: ["major"],
        automerge: false,
      },
    ],
  },
  null,
  2,
)}\n`;

const envExample = `# Copy to .env and fill in real values. .env is gitignored; this file is not.
# KEY=value
`;

function gitignoreShared() {
  return [
    "# Environment and secrets",
    ".env",
    ".env.*",
    "!.env.example",
    "secrets/",
    "",
    "# oh-my-openagent scratch and code index (per-machine, not portable)",
    ".omo/",
    ".codegraph",
    "",
    "# Git worktrees",
    ".worktrees/",
    "",
    "# Local artifacts",
    "logs/",
    "backups/",
    "",
    "# IDE",
    ".idea/",
    ".vscode/",
    "*.swp",
    "*~",
    "",
    "# OS",
    ".DS_Store",
    "Thumbs.db",
    "",
  ].join("\n");
}

function readme(name, description, commands) {
  return [
    `# ${name}`,
    "",
    description,
    "",
    "## Development",
    "",
    "| Task | Command |",
    "|------|---------|",
    ...commands.map(([task, cmd]) => `| ${task} | \`${cmd}\` |`),
    "",
  ].join("\n");
}

function agentsMd(name, description, commands, structure) {
  return [
    "# Agent Instructions",
    "",
    `<!-- TODO: replace with a one-paragraph purpose statement for ${name}. -->`,
    `<!-- Starting point: ${description} -->`,
    "",
    "## Commands",
    "",
    "| Task | Command |",
    "|------|---------|",
    ...commands.map(([task, cmd]) => `| ${task} | \`${cmd}\` |`),
    "",
    "## Structure",
    "",
    "| Path | What it is |",
    "|------|------------|",
    ...structure.map(([path, what]) => `| \`${path}\` | ${what} |`),
    "",
    "## Where To Look",
    "",
    "<!-- TODO: map common change tasks to the files that own them. -->",
    "",
    "## Key Conventions",
    "",
    "- Dependency changes go through the package manager, never hand-edited lockfiles.",
    "- Renovate automerges minor/patch updates after 7 days; majors are manual.",
    "- Formatter/linter gates run in pre-commit and CI; keep both green.",
    "",
    "## Anti-Patterns",
    "",
    "<!-- TODO: list project-specific anti-patterns worth guarding. -->",
    "",
  ].join("\n");
}

const ciHeader = (jobs) => `name: Lint & Test

on:
  pull_request:
  push:
    branches:
      - main

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
${jobs}`;

// --- python-uv archetype ----------------------------------------------------

function pythonFiles(ctx) {
  const { name, pkg, description, pythonVersion } = ctx;

  const preCommit = `repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: ${PRE_COMMIT_HOOKS_REV}
    hooks:
      - id: check-added-large-files
      - id: check-merge-conflict
      - id: end-of-file-fixer
      - id: mixed-line-ending
      - id: trailing-whitespace

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: ${RUFF_REV}
    hooks:
      - id: ruff-check
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/astral-sh/uv-pre-commit
    rev: ${UV_REV}
    hooks:
      - id: uv-lock

  - repo: https://github.com/DavidAnson/markdownlint-cli2
    rev: ${MARKDOWNLINT_REV}
    hooks:
      - id: markdownlint-cli2
`;

  const pyproject = `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[dependency-groups]
dev = [{ include-group = "lint" }, "pytest"]
lint = ["ruff"]

[project]
name = "${name}"
description = "${description}"
authors = [{ name = "tankdonut" }]
readme = "README.md"
requires-python = ">=3.13"
version = "0.0.1"
dependencies = []

[tool.hatch.build.targets.wheel]
packages = ["src/${pkg}"]

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 99
src = ["src"]

[tool.ruff.lint]
select = [
    "F", # pyflakes
    "E", # pycodestyle
    "I", # isort
    "N", # pep8-naming
    "UP", # pyupgrade
    "RUF", # ruff
    "B", # flake8-bugbear
    "C4", # flake8-comprehensions
    "ISC", # flake8-implicit-str-concat
    "PIE", # flake8-pie
    "PT", # flake-pytest-style
    "PTH", # flake8-use-pathlib
    "SIM", # flake8-simplify
    "TID", # flake8-tidy-imports
]
extend-ignore = [
    "RUF005",
    "RUF012",
]
unfixable = [
    # Disable removing unused imports in editors; only lint runs should fix.
    "F401",
]

[tool.ruff.lint.isort]
force-sort-within-sections = true
split-on-trailing-comma = false

[tool.ruff.lint.flake8-tidy-imports]
ban-relative-imports = "all"
`;

  const gitignore = [
    "# Byte-compiled / cache",
    "__pycache__/",
    "*.py[cod]",
    "",
    "# Distribution / packaging",
    "build/",
    "dist/",
    "*.egg-info/",
    "",
    "# Virtual environments",
    ".venv/",
    "",
    "# Test / coverage",
    ".pytest_cache/",
    ".coverage",
    "coverage.xml",
    "htmlcov/",
    "",
    "# Lint caches",
    ".ruff_cache/",
    ".mypy_cache/",
    "",
    ...gitignoreShared().split("\n"),
  ].join("\n");

  const ci = ciHeader(`  pre-commit:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Execute pre-commit
        uses: tankdonut/github-actions/actions/pre-commit@v1
        with:
          install_uv_deps: "true"
          uv_sync_args: "--group dev"
          extra_args: "--show-diff-on-failure --color=always --all-files"
`);

  const commands = [
    ["Install dependencies", "uv sync"],
    ["Run tests", "uv run pytest"],
    ["Run one test file", `uv run pytest tests/<file>.py`],
    ["Lint (fix mode)", "uv run ruff check --fix"],
    ["Format", "uv run ruff format"],
    ["Install git hooks", "pre-commit install"],
  ];

  const structure = [
    ["src/" + pkg + "/", "Package source"],
    ["tests/", "Test suite"],
  ];

  return {
    ".tool-versions": `pre-commit ${PRE_COMMIT_VERSION}\npython ${pythonVersion}\nuv ${UV_REV}\n`,
    ".gitignore": gitignore,
    ".markdownlint-cli2.yaml": markdownlintCli2,
    ".pre-commit-config.yaml": preCommit,
    "renovate.json": renovateJson,
    "pyproject.toml": pyproject,
    ".env.example": envExample,
    "README.md": readme(name, description, commands),
    "AGENTS.md": agentsMd(name, description, commands, structure),
    ".github/workflows/lint-and-test.yaml": ci,
    [`src/${pkg}/__init__.py`]: `"""${description}"""\n\n__version__ = "0.0.1"\n`,
    "tests/test_smoke.py": `from ${pkg} import __version__\n\n\ndef test_version():\n    assert __version__ == "0.0.1"\n`,
  };
}

// --- go archetype -----------------------------------------------------------

function goFiles(ctx) {
  const { name, description, goVersion } = ctx;

  const preCommit = `repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: ${PRE_COMMIT_HOOKS_REV}
    hooks:
      - id: check-added-large-files
      - id: check-merge-conflict
      - id: end-of-file-fixer
      - id: mixed-line-ending
      - id: trailing-whitespace

  - repo: https://github.com/DavidAnson/markdownlint-cli2
    rev: ${MARKDOWNLINT_REV}
    hooks:
      - id: markdownlint-cli2

  - repo: https://github.com/golangci/golangci-lint
    rev: ${GOLANGCI_REV}
    hooks:
      - id: golangci-lint
        entry: golangci-lint run --new-from-rev=HEAD ./...

  - repo: local
    hooks:
      - id: go-test
        name: go test
        entry: go test -race ./...
        language: system
        files: \\.go$
        pass_filenames: false
`;

  const golangci = `version: "2"

run:
  go: "${goVersion}"
  timeout: 5m
  tests: true

linters:
  default: none
  enable:
    - govet
    - errcheck
    - staticcheck
    - ineffassign
    - unused
    - bodyclose
    - noctx
    - nilerr
    - wastedassign
    - revive
    - gocritic
    - unparam
    - nolintlint
    - misspell

  settings:
    errcheck:
      check-type-assertions: true
      exclude-functions:
        - (io.Closer).Close
        - (net/http.ResponseWriter).Write
`;

  const gitignore = [
    "# Binaries",
    "/bin/",
    `/${name}`,
    "*.exe",
    "",
    "# Test binaries and coverage",
    "*.test",
    "*.out",
    "",
    ...gitignoreShared().split("\n"),
  ].join("\n");

  const makeSh = `#!/usr/bin/env bash
set -euo pipefail

# --- Bash version check ---
if [[ "\${BASH_VERSINFO[0]:-0}" -lt 4 ]]; then
  echo "Error: make.sh requires bash 4+. You have bash \${BASH_VERSION}." >&2
  exit 1
fi

# --- Repository root ---
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_ROOT"

# --- Helpers ---
log_info()    { echo "[INFO] $*"; }
log_success() { echo "[OK] $*"; }
log_error()   { echo "[ERROR] $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./make.sh <target>

Targets:
  build   Build the ${name} binary into bin/
  test    Run all tests with the race detector
  lint    Run golangci-lint
  fmt     Format code and tidy modules
EOF
}

cmd_build() {
  mkdir -p bin
  go build -o bin/${name} ./cmd/${name}
  log_success "built bin/${name}"
}

cmd_test() {
  go test -race ./...
  log_success "tests passed"
}

cmd_lint() {
  command -v golangci-lint &>/dev/null || log_error "golangci-lint not found (pre-commit runs it in its own env)"
  golangci-lint run ./...
  log_success "lint passed"
}

cmd_fmt() {
  go fmt ./...
  go mod tidy
  log_success "formatted and tidied"
}

case "\${1:-}" in
  build) cmd_build ;;
  test) cmd_test ;;
  lint) cmd_lint ;;
  fmt) cmd_fmt ;;
  *) usage; exit 1 ;;
esac
`;

  const mainGo = `package main

import (
	"flag"
	"fmt"
)

// version is overridden at build time via:
//   go build -ldflags "-X main.version=X.Y.Z" ./cmd/${name}
var version = "dev"

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version)
		return
	}

	fmt.Println("${name}: ${description}")
}
`;

  const ci = ciHeader(`  lint-and-test:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Go
        uses: actions/setup-go@v7
        with:
          go-version-file: go.mod

      - name: Execute pre-commit
        uses: tankdonut/github-actions/actions/pre-commit@v1
        with:
          extra_args: "--show-diff-on-failure --color=always --all-files"
`);

  const commands = [
    ["Build", `./make.sh build`],
    ["Test", `./make.sh test`],
    ["Lint", `./make.sh lint`],
    ["Format + tidy", `./make.sh fmt`],
    ["Install git hooks", "pre-commit install"],
  ];

  const structure = [
    [`cmd/${name}/`, "Main binary"],
    ["make.sh", "Task runner (build/test/lint/fmt)"],
  ];

  return {
    ".tool-versions": `golang ${goVersion}\npre-commit ${PRE_COMMIT_VERSION}\npython 3.13.5\nuv ${UV_REV}\n`,
    ".gitignore": gitignore,
    ".markdownlint-cli2.yaml": markdownlintCli2,
    ".pre-commit-config.yaml": preCommit,
    "renovate.json": renovateJson,
    "go.mod": `module github.com/tankdonut/${name}\n\ngo ${goVersion}\n`,
    ".golangci.yml": golangci,
    ".env.example": envExample,
    "README.md": readme(name, description, commands),
    "AGENTS.md": agentsMd(name, description, commands, structure),
    ".github/workflows/lint-and-test.yaml": ci,
    "make.sh": makeSh,
    [`cmd/${name}/main.go`]: mainGo,
  };
}

// --- Driver -----------------------------------------------------------------

const opts = parse();
const dir = resolve(opts.dir);
const name = opts.name || basename(dir);
if (!NAME_RE.test(name)) {
  fail(`--name "${name}" must be lowercase letters/digits/hyphens, starting with a letter`);
}
const pkg = pythonIdentifier(name);
const archetype = opts.archetype;

if (existsSync(dir)) {
  const entries = readdirSync(dir);
  if (entries.length > 0) {
    fail(`target directory is not empty: ${dir} (${entries.length} entries) — new repos only`);
  }
}

const ctx = {
  name,
  pkg,
  description: opts.description,
  pythonVersion: opts["python-version"],
  goVersion: opts["go-version"],
};
const files = archetype === "python-uv" ? pythonFiles(ctx) : goFiles(ctx);

if (opts["dry-run"]) {
  console.log(`dry run: ${archetype} scaffold in ${dir}`);
  for (const path of Object.keys(files).sort()) console.log(`  ${path}`);
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
for (const [path, content] of Object.entries(files)) {
  const full = resolve(dir, path);
  mkdirSync(resolve(full, ".."), { recursive: true });
  writeFileSync(full, content, { mode: path === "make.sh" ? 0o755 : 0o644 });
}

console.log(`scaffolded ${archetype} repository: ${dir}`);
for (const path of Object.keys(files).sort()) console.log(`  wrote ${path}`);
console.log("");
console.log("next steps:");
if (archetype === "python-uv") {
  console.log("  uv sync && uv run pytest && uv run ruff check && uv run ruff format --check .");
  console.log("  git init && pre-commit install");
} else {
  console.log("  go mod tidy && go build ./... && go test -race ./...");
  console.log("  git init && pre-commit install");
}
console.log("  fill AGENTS.md TODO markers before the first commit");

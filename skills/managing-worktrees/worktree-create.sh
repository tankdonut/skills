#!/usr/bin/env bash
# worktree-create.sh — create an isolated git worktree under the MAIN
# checkout's canonical worktree directory.
#
# Usage:
#   worktree-create.sh <branch-name>
#
# Environment:
#   WORKTREE_DIR        worktree directory relative to the main checkout
#                       root (default: .worktrees)
#   WORKTREE_BASE       start point for the new branch (default: HEAD of
#                       the main checkout)
#   WORKTREE_SETUP_CMD  shell snippet run inside the new worktree instead
#                       of the auto-detected dependency setup
#
# Behavior:
#   - Worktrees always live under the MAIN checkout (resolved via
#     git-common-dir), never nested under another worktree, regardless of
#     which checkout invokes this script.
#   - Refuses to create unless the worktree directory is gitignored in
#     the main repo — an unignored worktree commits the whole tree.
#   - Auto-detected setup after creation (unless WORKTREE_SETUP_CMD):
#     go.mod -> go mod download; package.json -> npm ci|install;
#     Cargo.toml -> cargo fetch; uv.lock -> uv sync;
#     requirements.txt -> pip install -r.

set -euo pipefail

info() { echo "==> $*"; }
warn() { echo "warning: $*" >&2; }
die()  { echo "error: $*" >&2; exit 1; }

usage() {
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

branch="${1:-}"
[[ -n "$branch" ]] || usage

git rev-parse --is-inside-work-tree &>/dev/null \
  || die "not inside a git work tree"

main_root="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
wt_dir="${WORKTREE_DIR:-.worktrees}"
wt_path="$main_root/$wt_dir/$branch"

[[ -d "$wt_path" ]] && die "worktree already exists: $wt_path"

# Query with a trailing slash so dir-only gitignore patterns match even
# before the directory exists on disk.
if ! git -C "$main_root" check-ignore -q "$wt_dir/"; then
  die "'$wt_dir' is not gitignored in the main checkout — add '$wt_dir/' to .gitignore and commit, then re-run."
fi

base="${WORKTREE_BASE:-HEAD}"
info "Creating worktree at $wt_path on branch $branch (base: $base)"
git -C "$main_root" worktree add "$wt_path" -b "$branch" "$base"

cd "$wt_path"

# Dependency setup: explicit override wins, otherwise detect.
if [[ -n "${WORKTREE_SETUP_CMD:-}" ]]; then
  info "Running WORKTREE_SETUP_CMD"
  bash -c "$WORKTREE_SETUP_CMD"
else
  if [[ -f go.mod ]]; then
    info "Downloading Go dependencies"
    go mod download
  elif [[ -f package.json ]]; then
    if [[ -f package-lock.json ]]; then
      info "Installing npm dependencies (npm ci)"
      npm ci
    else
      info "Installing npm dependencies (npm install)"
      npm install
    fi
  elif [[ -f Cargo.toml ]]; then
    info "Fetching Rust dependencies"
    cargo fetch
  elif [[ -f uv.lock ]] || { [[ -f pyproject.toml ]] && command -v uv &>/dev/null; }; then
    info "Syncing Python environment (uv sync)"
    uv sync
  elif [[ -f requirements.txt ]]; then
    info "Installing Python dependencies (pip)"
    pip install -r requirements.txt
  else
    info "No recognized dependency manifest — skipping setup"
  fi
fi

echo
info "Worktree ready: $wt_path"
info "Enter it with: cd $wt_path"
warn "Run the baseline test suite before starting work — a dirty baseline makes every later failure ambiguous."

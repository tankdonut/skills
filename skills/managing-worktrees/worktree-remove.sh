#!/usr/bin/env bash
# worktree-remove.sh — tear down a worktree created by worktree-create.sh.
#
# Usage:
#   worktree-remove.sh <branch-name>
#
# Environment:
#   WORKTREE_DIR           worktree directory relative to the main
#                          checkout root (default: .worktrees)
#   WORKTREE_TEARDOWN_CMD  best-effort shell snippet run inside the
#                          worktree BEFORE removal — use it to tear down
#                          project state the worktree owns (compose
#                          stacks, volumes, generated env files whose
#                          loss would orphan resources). Failure warns
#                          but does not block removal.
#   WORKTREE_FORCE=1       remove even with uncommitted changes or
#                          untracked files (passes --force to git).
#
# Behavior:
#   - Refuses when the worktree has uncommitted (tracked) changes,
#     unless WORKTREE_FORCE=1. Untracked files are caught by git itself.
#   - NEVER deletes the branch — a removed worktree's branch may hold
#     unmerged work. Branch deletion is worktree-merge.sh's job, and only
#     after the squash tree-identity proof.

set -euo pipefail

info() { echo "==> $*"; }
warn() { echo "warning: $*" >&2; }
die()  { echo "error: $*" >&2; exit 1; }

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

branch="${1:-}"
[[ -n "$branch" ]] || usage

main_root="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
wt_dir="${WORKTREE_DIR:-.worktrees}"
wt_path="$main_root/$wt_dir/$branch"

[[ -d "$wt_path" ]] || die "no worktree at $wt_path"

if [[ "${WORKTREE_FORCE:-0}" != "1" ]]; then
  if ! git -C "$wt_path" diff --quiet HEAD || ! git -C "$wt_path" diff --cached --quiet HEAD; then
    die "worktree has uncommitted (tracked) changes — commit or stash them, or re-run with WORKTREE_FORCE=1."
  fi
fi

if [[ -n "${WORKTREE_TEARDOWN_CMD:-}" ]]; then
  info "Running WORKTREE_TEARDOWN_CMD (best-effort)"
  if ! (cd "$wt_path" && bash -c "$WORKTREE_TEARDOWN_CMD"); then
    warn "teardown command failed — continuing with removal"
  fi
fi

info "Removing worktree: $wt_path"
if [[ "${WORKTREE_FORCE:-0}" == "1" ]]; then
  git -C "$main_root" worktree remove --force "$wt_path"
else
  if ! git -C "$main_root" worktree remove "$wt_path"; then
    die "git worktree remove failed (untracked files?) — re-run with WORKTREE_FORCE=1 to override."
  fi
fi
info "Removed worktree: $wt_path (branch '$branch' left intact)"

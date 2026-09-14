#!/usr/bin/env bash
# worktree-merge.sh — rebase a worktree branch onto main, merge it into
# local main (squash by default, fast-forward opt-in), then tear down
# the worktree and delete the branch.
#
# Usage:
#   worktree-merge.sh <branch-name> [subject]
#
# Environment:
#   WORKTREE_DIR    worktree directory relative to the main checkout root
#                   (default: .worktrees)
#   MAIN_BRANCH     integration branch in the main checkout (default: main)
#   WORKTREE_MERGE  merge strategy:
#                     squash (default) — land as ONE commit; subject
#                       required (or derived from the branch name), body
#                       lists the squashed series
#                     ff — fast-forward main to the branch tip, preserving
#                       the original commit series verbatim (subject
#                       ignored)
#   KEEP_WT=1       keep the worktree and branch after merging
#
# Safety properties:
#   - Refuses when either tree is dirty, the worktree is on the wrong
#     branch, the main checkout is not on MAIN_BRANCH, or the branch has
#     no commits beyond MAIN_BRANCH.
#   - Rebase conflicts leave the rebase mid-flight for manual resolution
#     (fix files, git add, git rebase --continue), then re-run this
#     script. git rebase --abort bails out with the branch untouched.
#   - Merge conflicts are aborted cleanly by the script; re-run after
#     the conflict source settles.
#   - The branch force-delete only runs AFTER `git diff MAIN_BRANCH
#     <branch>` is empty — the branch content provably exists verbatim
#     on main. Any tree mismatch keeps the worktree and branch.

set -euo pipefail

info() { echo "==> $*"; }
warn() { echo "warning: $*" >&2; }
die()  { echo "error: $*" >&2; exit 1; }

usage() {
  sed -n '2,34p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

branch="${1:-}"
subject="${2:-}"
[[ -n "$branch" ]] || usage

strategy="${WORKTREE_MERGE:-squash}"
case "$strategy" in
  squash|ff) ;;
  *) die "unknown WORKTREE_MERGE strategy '$strategy' (expected: squash or ff)." ;;
esac

main_branch="${MAIN_BRANCH:-main}"
main_root="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
wt_dir="${WORKTREE_DIR:-.worktrees}"
wt_path="$main_root/$wt_dir/$branch"

[[ -d "$wt_path" ]] || die "no worktree at $wt_path"
wt_branch="$(git -C "$wt_path" branch --show-current)"
[[ "$wt_branch" == "$branch" ]] \
  || die "worktree at $wt_path is on '$wt_branch', not '$branch'."
[[ "$(git -C "$main_root" branch --show-current)" == "$main_branch" ]] \
  || die "main checkout is not on branch $main_branch."

if ! git -C "$wt_path" diff --quiet HEAD || ! git -C "$wt_path" diff --cached --quiet HEAD; then
  die "worktree has uncommitted changes — commit or stash them first."
fi
if ! git -C "$main_root" diff --quiet HEAD || ! git -C "$main_root" diff --cached --quiet HEAD; then
  die "main checkout has uncommitted changes — commit or stash them first."
fi
[[ -n "$(git -C "$main_root" log --oneline "$main_branch..$branch")" ]] \
  || die "$branch has no commits beyond $main_branch."

commit_count="$(git -C "$main_root" rev-list --count "$main_branch..$branch")"

info "Rebasing $branch onto $main_branch..."
if ! git -C "$wt_path" rebase "$main_branch"; then
  die "rebase hit conflicts — in $wt_path: fix the conflicted files (git status lists them), git add <files>, git rebase --continue (repeat per commit; git rebase --skip drops an already-applied commit; git rebase --abort bails with the branch untouched), then re-run this script."
fi

if [[ "$strategy" == "ff" ]]; then
  if [[ -n "$subject" ]]; then
    warn "subject ignored in ff mode — fast-forward preserves the original $commit_count commits verbatim."
  fi
  info "Fast-forward merging $branch into local $main_branch..."
  if ! git -C "$main_root" merge --ff-only "$branch"; then
    die "fast-forward refused ($main_branch is not an ancestor — it moved during the rebase) — re-run this script to re-rebase."
  fi
else
  if [[ -z "$subject" ]]; then
    subject="${branch%%/*}: $(echo "${branch#*/}" | tr '-' ' ')"
    warn "no subject given — derived '$subject' from the branch name. Pass an explicit one for an imperative description."
  fi

  squash_body="$(git -C "$main_root" log --oneline "$main_branch..$branch" | sed 's/^/  /')"

  info "Squash fast-forward merging $branch into local $main_branch..."
  if ! git -C "$main_root" merge --squash "$branch"; then
    git -C "$main_root" merge --abort 2>/dev/null || git -C "$main_root" reset --hard HEAD
    die "squash merge conflicted ($main_branch moved during the rebase) — aborted cleanly, re-run this script."
  fi
  git -C "$main_root" commit -m "$subject" -m "Squash of $branch ($commit_count commits):

$squash_body"
fi

if [[ -n "$(git -C "$main_root" diff "$main_branch" "$branch")" ]]; then
  die "squash tree differs from $branch — keeping worktree and branch; inspect: git -C $main_root diff $main_branch $branch"
fi

if [[ "${KEEP_WT:-0}" == "1" ]]; then
  info "KEEP_WT=1 — worktree and branch kept."
  exit 0
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! "$script_dir/worktree-remove.sh" "$branch"; then
  warn "the merge itself succeeded (squash commit is on $main_branch, tree proof passed) — only teardown failed, likely untracked files in the worktree."
  die "finish manually: WORKTREE_FORCE=1 $script_dir/worktree-remove.sh $branch && git -C $main_root branch -D $branch"
fi
git -C "$main_root" branch -D "$branch"
info "Merged $branch into $main_branch ($strategy); worktree and branch removed."

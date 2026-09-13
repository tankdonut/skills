---
name: managing-worktrees
license: MIT
description: Use when starting multi-step feature work (2+ commits, new files, refactors) that needs an isolated workspace, when running parallel worktree branches off one repo, or when finishing such work — squash-merging a worktree branch back or tearing a worktree down.
---

# Managing Worktrees

## Overview

Isolated feature workspaces via git worktrees under one canonical
`.worktrees/` directory at the MAIN checkout, with a local squash-merge
flow that is provably safe before deleting anything.

Three zero-dependency bash scripts beside this file wrap the whole
lifecycle: `worktree-create.sh`, `worktree-merge.sh`,
`worktree-remove.sh`.

**Core principle:** worktrees live in ONE canonical place (the main
checkout), merge back as ONE squash commit by default (fast-forward by
choice), and nothing is deleted until a tree-identity proof says the
content survives verbatim on main.

## When to Use

Use a worktree when the task involves:

- Multiple commits (a clean series before landing)
- New files or directories (no pollution of the main checkout)
- A long-running investigation that may be abandoned (clean teardown)
- Parallel work on unrelated features (each worktree is independent)

Skip the worktree for: single-file typo fixes, dependency bumps,
documentation tweaks.

If the harness provides a native worktree tool, prefer it; these scripts
are for repos with no such tooling.

## Scripts

```bash
<skill-dir>/worktree-create.sh  <branch>            # .worktrees/<branch>, setup deps
<skill-dir>/worktree-merge.sh   <branch> [subject]  # rebase + merge (squash) + teardown
<skill-dir>/worktree-remove.sh  <branch>            # teardown only (branch kept)
```

| Env var | Applies to | Default | Purpose |
|---------|-----------|---------|---------|
| `WORKTREE_DIR` | all | `.worktrees` | Worktree dir relative to main root |
| `WORKTREE_BASE` | create | `HEAD` | Start point for the new branch |
| `WORKTREE_SETUP_CMD` | create | detected | Shell snippet run in the new worktree instead of auto-detected dependency setup |
| `WORKTREE_TEARDOWN_CMD` | remove | none | Best-effort snippet run inside the worktree before removal (compose down, volumes, generated env) |
| `WORKTREE_FORCE=1` | remove | off | Remove despite dirty/untracked state |
| `KEEP_WT=1` | merge | off | Keep worktree + branch after merging |
| `MAIN_BRANCH` | merge | `main` | Integration branch |
| `WORKTREE_MERGE` | merge | `squash` | `squash` lands one commit; `ff` fast-forwards main to the branch tip, preserving the commit series |

## Workflow

1. **Create** — from anywhere in the repo:

   ```bash
   worktree-create.sh feat/my-feature
   cd .worktrees/feat/my-feature
   ```

   Run the baseline test suite BEFORE starting work.

2. **Work** — commit normally on the branch (naming:
   `<type>/<short-description>`, no issue numbers).

3. **Merge** — when done and green:

   ```bash
   worktree-merge.sh feat/my-feature "feat(scope): imperative description"
   ```

   Rebases onto main, squash-merges as one commit whose body lists the
   squashed series, removes the worktree, deletes the branch. Pass an
   explicit subject — Conventional Commits hooks will reject a bad one.

   To land the commit series verbatim instead of squashing (curated
   history worth preserving):

   ```bash
   WORKTREE_MERGE=ff worktree-merge.sh feat/my-feature
   ```

   Fast-forward preserves the original commits — no subject, no squash
   commit, hooks already validated each commit when it was made.

4. **Or remove** — for abandoned work:

   ```bash
   worktree-remove.sh feat/my-feature
   ```

   The branch is left intact; delete it manually once certain.

## Resolving Conflicts

Merges conflict in two places; both resolve in the WORKTREE, not the
main checkout.

**Rebase conflict (the common one).** The script exits non-zero with the
rebase mid-flight inside the worktree:

1. `cd` into the worktree; `git status` lists the conflicted files.
2. Fix each conflict marker (`<<<<<<<`), then `git add <files>`.
3. `git rebase --continue` — repeat per replayed commit.
   `git rebase --skip` drops a commit already applied upstream;
   `git rebase --abort` bails out with the branch untouched.
4. Re-run `worktree-merge.sh` — the now-clean rebase is a no-op and the
   merge proceeds.

**Merge conflict (rare — only if main moved between the rebase and the
merge).** The script aborts the merge itself (`merge --abort` /
`reset --hard`), leaving both checkouts clean. Just re-run it; the
re-rebase replays the branch onto the new main tip.

Never resolve by hand-editing the main checkout mid-flow — the script's
tree-identity proof depends on a clean two-sided state.

## Invariants

1. **Canonical location.** Worktrees always resolve to the MAIN
   checkout's `.worktrees/` (via `git-common-dir`) — never nested under
   another worktree, no matter which checkout runs the command.
2. **Gitignore guard.** Creation refuses unless `.worktrees` is
   gitignored. An unignored worktree directory commits the whole tree.
3. **Shared `.git`.** All worktrees share the common git dir: hooks
   install once in the main checkout, and the same branch cannot be
   checked out in two worktrees at once.
4. **Per-file symlinks, not directory symlinks.** When linking ignored
   files (secrets, env) into a worktree, create the real directory and
   symlink each file inside it. Trailing-slash gitignore patterns
   (`secrets/`) match directories only — a directory symlink shows up as
   untracked.
5. **Squash by default, ff by choice.** Local merges land as exactly one
   commit: rebase onto main → `merge --squash` → commit with subject +
   "Squash of `<branch>` (N commits):" body. Never a merge commit, never
   rebase-and-merge into the local main. `WORKTREE_MERGE=ff` opts into
   fast-forward when the branch's own commit series is worth preserving
   verbatim.
6. **Tree-identity proof.** `git branch -D` runs only after
   `git diff MAIN_BRANCH <branch>` is empty — the branch provably exists
   verbatim on main. Any mismatch keeps both worktree and branch.
7. **Remove never deletes the branch.** Only merge does, post-proof.
8. **Conflict etiquette.** Rebase conflicts leave the rebase mid-flight:
   resolve, `git rebase --continue`, re-run merge. Squash-merge conflicts
   abort cleanly; re-run.
9. **Isolated runtime state.** Worktrees that run stacks (compose, DBs)
   need their own project names, ports, and volumes — wire that into
   `WORKTREE_SETUP_CMD` / `WORKTREE_TEARDOWN_CMD` so concurrent worktrees
   never fight over containers or schema.
10. **Land or abandon within a week.** Stale worktrees rot against main.

## Quick Reference

| Situation | Action |
|-----------|--------|
| Already in a worktree (`git-common-dir` ≠ git dir) | Work there; don't nest |
| `.worktrees` not ignored | Add to .gitignore + commit, then create |
| Preserve the branch's commit series | `WORKTREE_MERGE=ff worktree-merge.sh …` |
| Rebase conflict during merge | Resolve in the worktree + `git rebase --continue`, re-run merge |
| Merge conflict (main moved mid-flow) | Script already aborted cleanly — just re-run |
| Merge landed but teardown blocked (untracked files) | `WORKTREE_FORCE=1 worktree-remove.sh <branch>` + `git branch -D <branch>` |
| Squash tree differs after merge | Investigate `git diff main <branch>`; both kept |
| Keep branch around after merge | `KEEP_WT=1 worktree-merge.sh …` |
| Dirty worktree must go | `WORKTREE_FORCE=1 worktree-remove.sh …` |
| Worktree runs a compose stack | `WORKTREE_TEARDOWN_CMD='docker compose -p … down -v'` |
| Not on main in the main checkout | `git -C <main> switch main` first |

## Common Mistakes

| Mistake | Reality |
|---------|---------|
| Creating a worktree from inside a worktree | Scripts pin to the main checkout; manual `git worktree add` nests — don't |
| Symlinking the `secrets/` directory itself | Trailing-slash ignore patterns don't match symlinks; it shows as untracked and blocks teardown |
| Resolving rebase conflicts in the main checkout | The rebase runs inside the worktree — fix, `git add`, `rebase --continue` there, then re-run |
| Running `git branch -D` before the tree proof | The proof is what makes force-delete safe; skipping it risks losing unmerged work |
| Merging with a dirty main checkout | Refused — the squash commit would capture unrelated state |
| Leaving untracked scratch files in the worktree | They block teardown after a successful merge — commit, gitignore, or clean them first |
| Skipping the baseline test after create | A dirty baseline makes every later failure ambiguous |
| Expecting remote history | This is a LOCAL squash flow; remote PRs still need squash-and-merge on the platform |
| Deleting the branch via remove | Remove keeps the branch on purpose; only merge deletes it, post-proof |

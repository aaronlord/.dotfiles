---
name: my-implement-tasks
description: >
  Implement every remaining task in a groomed plan unattended — the end-to-end "orchestrator"
  mode. Use when the user says implement-tasks, implement the whole plan, or drive it
  automatically after my-plan-to-tasks. Do NOT use for manual one-task-at-a-time progress; use
  my-implement-task for conductor mode instead.
version: 1.0.0
---

# /my-implement-tasks

Drive a groomed plan through its tasks unattended, one slice at a time: each task implemented in
a fresh context, verified and committed before the next begins, then a single PR opened at the
slice boundary and the run stopped there — leaving room for review feedback before the next
slice starts (see
[`../my-plan-to-tasks/references/slicing-spine.md`](../my-plan-to-tasks/references/slicing-spine.md)).

## When to use

Invoke:

```text
/my-implement-tasks {name}
```

Use this when the user wants the whole groomed plan driven end-to-end without stopping after
each task.

If no name is given:

1. Run `ls .plans/` and output the list of available plans to the user.
2. Ask the user which plan to work on. Do not proceed until they answer.

This skill is the async/multi-task counterpart to `/my-implement-task`. `/my-implement-task`
implements one task and stops so a human can look — the "conductor" mode. This skill keeps
going on its own, only stopping when it's actually stuck — the "orchestrator" mode. Read
`/my-implement-task`'s SKILL.md first if you haven't; this skill reuses its per-task machinery
([`references/implementation-contract.md`](references/implementation-contract.md),
[`references/trajectory-audit.md`](references/trajectory-audit.md)) rather than redefining it.

## When NOT to use

- Do not use this when the user wants to inspect, review, or steer each task before the next
  begins. Use `/my-implement-task` for that manual conductor flow.
- Do not continue retrying or attempting further tasks after the halt conditions in step 7 are
  met.
- Do not start a slice's tasks while an earlier slice's PR is open and unaddressed without
  checking with the user first — see step 4a.

## Process

### 1. Load the plan

Read `.plans/{name}/tasks.md` in full to get every task's title, status, dependency list, and
**slice** (the `Slice` column and the `## Slices` table). If the plan predates slicing and has no
`## Slices` table, treat the whole plan as one slice named after the plan itself — the loop below
then opens exactly one PR at the end, same as before this feature existed.

### 2. Check the working branch

Run `git branch --show-current`. If you are on the default branch (`main`/`master`), stop and
ask the user which branch to use or whether to create one. Do not assume a branch name.

### 3. Require a clean working tree

Run `git status --porcelain`. If it is non-empty, stop and tell the user to commit or stash
first. This loop commits automatically after every task — starting from a dirty tree risks
sweeping unrelated changes into the first commit.

### 4. Build the task queue

From `tasks.md`, note for every task: its status (`todo`/`done`/`blocked`), its `Depends on`
list, and its `Slice`. From the `## Slices` table, note for every slice: its tasks, its branch
(if already created), and its PR (if already opened).

All loop state below is derived from disk, not held only in memory — the orchestrator's own
session is not reset between tasks the way each subagent dispatch is, and generic
auto-compaction could otherwise summarize away an in-memory blocked-list or counter mid-run.
Re-derive on every pass through 5.1 rather than trusting a running tally:

- `done` — tasks whose status cell is `done`.
- `blocked` — tasks whose status cell is `blocked`. When you add one, write the exact reason
  into that task's file under a `## Blocked` section, and set its `tasks.md` status cell to
  `blocked` (not `todo`) — this is what makes the block durable across a compaction.
- `consecutive_escalations` — recompute it by walking `tasks.md` in file order and counting the
  trailing run of `blocked` statuses immediately preceding the current position, resetting the
  count at the most recent `done`. Don't keep this only as a mental counter.

### 4a. Resolve the current slice's branch

Find the slice that owns the next candidate task (first task not `done`/`blocked` with every
dependency `done` — same rule as 5.1). Compare it against the current branch:

- **Its branch already exists and matches the current branch** — nothing to do, proceed to the
  loop.
- **Its branch is already recorded in `## Slices` but isn't checked out** — `git checkout` it and
  proceed. This is a plain resume of a slice already in progress.
- **It has no branch recorded yet, and this is slice 1** — its branch is simply whatever step 2
  already confirmed you're on. Record it and proceed, no question needed.
- **It has no branch recorded yet, and this is a later slice** — the previous slice's PR must
  merge first before this slice can start (see `slicing-spine.md`'s branch/PR sequencing rule).
  Check whether it has merged:

  ```bash
  gh pr view {previous slice's PR} --json state,mergedAt
  ```

  - **Merged** — `git checkout {default branch}`, pull, then `git checkout -b
    {plan-name}/slice-{nn}-{slug}` off the now up-to-date default branch. Record the new branch
    in `## Slices` and proceed.
  - **Not merged** — stop here. Tell the user the previous slice's PR ({url}) hasn't merged yet;
    resolve any review feedback first (e.g. via `/my-fix-pr`), merge it, then re-run this skill.
    Do not create the next slice's branch.

### 5. The loop

Repeat the following until told to stop by 5.1 or 5.6.

#### 5.1 Pick the next task

The next candidate is the first task in file order that is not in `done`, not in `blocked`, and
whose every dependency is in `done`.

- If no candidate exists but incomplete tasks remain, everything left depends on (or is)
  something blocked. Go to **7. Halt**.
- If no candidate exists and every task is in `done`, go to **8. Wrap up**.

#### 5.2 Implement

Follow [`references/implementation-contract.md`](references/implementation-contract.md) for this
task's plan name and file path — exactly as `/my-implement-task`'s subagent branch does. Dispatch
it to an isolated subagent (e.g. the generic `worker` agent via the `subagent` tool), or perform
it directly in the current session. One task, one fresh context (or scope) per pass — never batch
multiple tasks together.

#### 5.3 Verify the report

Check the report against [`references/trajectory-audit.md`](references/trajectory-audit.md),
exactly as `/my-implement-task` step 3a.3 does — dispatch to an isolated subagent if you want a
clean context, otherwise run the check yourself.

- If the audit's blockers are the kind you can resolve yourself (it merely under-reported
  something, evidence is available to fix directly) — resolve them yourself and continue to 5.4.
  This does not count as a strike.
- If a blocker means the work is actually wrong, or the implementation step itself reported
  BLOCKED — this task has failed this attempt. Skip to **5.5**.

#### 5.4 Lightweight quality gate

Skip this step entirely for the plan's final "Ensure CI passes" task — its acceptance criteria
are procedural (commands pass or they don't), and the trajectory audit already re-runs the exact
commands it claims to have run.

For every other task:

1. Get the task's diff: `git diff HEAD --stat` for the file list, `git diff HEAD` for content.
   This is uncommitted — nothing has landed yet.
2. Locate the standards sources that apply to the changed files: `AGENTS.md` (root + path-level),
   and every `.github/instructions/*.instructions.md` whose `applyTo:` glob matches a changed
   file — same lookup `/my-review` step 3 does. Build the file → instruction-file map.
3. Check the diff against [`references/standards-review-criteria.md`](references/standards-review-criteria.md),
   passing the located standards sources (full content) and the file → instruction-file map.
   Dispatch to an isolated subagent if you want a clean context, otherwise run it yourself.
4. Check the diff against [`references/spec-review-criteria.md`](references/spec-review-criteria.md),
   using **the task file itself** as the spec — not the plan's `prd.md`. The task's own
   "Acceptance Criteria" and "Interfaces" sections are the requirements to check the diff
   against; the PRD is the wrong scope here because most PRD requirements legitimately belong to
   other tasks, and this would flag all of them as `missing`.

**Gate fails** if the standards check reports any `hard violation` row, or the spec check reports
any `missing`/`partial`/`wrong` row. A `judgement call` or `scope creep` row alone does not fail
the gate — carry it into the final report (6 or 8) as a note, not a blocker.

If the gate passes, go to **5.6**. If it fails, go to **5.5**.

#### 5.5 Retry once, then escalate

If this task has not yet been retried in this run: re-run step 5.2 once, naming the exact
failing finding(s) verbatim (file:line, rule or spec ref, and the reviewer's recommendation). Go
back to 5.2 for this same task.

If this is the second failure for this task (retry already used): this task is an
**escalation**.

- Add it to `blocked`: set its `tasks.md` status cell to `blocked`, and write the exact reason
  (the BLOCKED message, or the finding that recurred) into that task's file under a
  `## Blocked` section.
- Recompute `consecutive_escalations` per step 4's rule. If it is now `3`, go to **7. Halt**
  immediately.
- Otherwise, go back to **5.1** and try the next available task.

#### 5.6 Commit and continue

Mark the task done, same as `/my-implement-task` step 4b:

- Task file: `_Status: todo_` → `_Status: done_`.
- `tasks.md`: status cell `todo` → `done`, progress count updated.

Stage only the files the implementation step reported changed, cross-checked against
`git diff HEAD --stat` — never `git add -A` or `git add .`. Commit:

```text
git add {only this task's changed files}
git commit -m "{type}: {task title, imperative}"
```

Infer `type` (`feat`/`fix`/`refactor`/`test`/`chore`) from the task's content, same judgement
`/my-review`'s commit step uses.

Add the task to `done`.

**Slice boundary check.** If the task just committed is the last task of its slice (per the
`## Slices` table), the slice is ready to ship — go to **6. Ship the slice** instead of looping
back. Otherwise go back to **5.1**.

### 6. Ship the slice

1. Push the current branch: `git push -u origin HEAD` (or plain `git push` if it already has an
   upstream).
2. Open its PR following `/my-open-pr`'s workflow: it targets the default branch, same as any
   normal PR. Title/body follow `/my-open-pr`'s usual rules, scoped to this slice's tasks only
   (not the whole plan).
3. Record the branch name and PR URL in `tasks.md`'s `## Slices` table for this slice.
4. If every task in `tasks.md` is now `done`, there is no next slice to protect — go to
   **8. Wrap up**.
5. Otherwise, **stop the run here.** Do not create the next slice's branch and do not start its
   tasks in this run — the next slice must not be built on code that's still under review.
   Report the PR just opened (URL, tasks it covers) and tell the user: address any review
   feedback and merge it, then re-run `/my-implement-tasks {name}` — step 4a on that next run
   checks whether it has merged before cutting the next slice's branch.

### 7. Halt (circuit breaker)

Stop the loop. Do not attempt any further task this run. Report to the user:

- Every task completed and committed so far, in order.
- Every slice PR opened so far, with its URL.
- Every blocked task, with its exact reason.
- Any task left un-attempted because it depends on a blocked task.

Three consecutive escalations means something systemic is wrong — a bad grooming pass, a broken
environment, the wrong branch — not that any individual task needs one more retry. Hand it to
the user rather than continuing to spend turns on it.

### 8. Wrap up (all tasks done)

Report every task completed and committed, in order, and every slice PR opened — including the
one just opened in step 6 — with its URL, in order. Call out any `judgement call`/`scope creep`
rows the gate let through — they didn't block a commit, but they're worth a human glance. Suggest
`/my-review` against each open slice PR for a final holistic pass before merging it.

## Output format

On halt, report:

- every task completed and committed so far, in order
- every slice PR opened so far, with its URL
- every blocked task, with its exact reason
- any task left un-attempted because it depends on a blocked task

On full completion, report:

- every task completed and committed, in order
- every slice PR opened, with its URL, in order
- any `judgement call`/`scope creep` rows that did not block the gate
- `/my-review` against each slice PR as the suggested final pass before merging it

## Anti-patterns to avoid

- Never batch multiple tasks into one implementation pass or dispatch. One task, one fresh
  context, every time — that isolation is what makes the loop trustworthy.
- Never commit files the task didn't touch.
- Never commit secrets, credentials, or `.env` files.
- This skill commits automatically; `/my-implement-task` does not — that's the entire behavioral
  trade the loop makes for autonomy.
- If the user interrupts mid-loop, whatever is already committed stays committed. Don't roll
  anything back automatically.
- The full-suite CI gate isn't a separate step here — it's the plan's final task, which depends
  on every other task, so 5.1 can only ever select it last.
- Never merge a slice's PR yourself as part of this loop; opening it is this skill's job,
  merging it is the user's/reviewer's call.
- Never open a slice's PR before its last task is committed, and never skip opening it once that
  task lands — a slice sitting uncommitted-to-a-PR defeats the entire point of slicing.
- Never start the next slice's tasks in the same run a PR was just opened for the current one,
  unless that PR was the plan's very last task. Stop and wait for it to merge — that's the whole
  reason slices ship one PR at a time instead of all at once.
- Never assume a slice's PR has merged; check with `gh pr view --json state,mergedAt` (step 4a)
  rather than guessing when starting the next slice.
- Never branch the next slice off anything but the up-to-date default branch — no stacking on
  an unmerged PR.

---
name: my-implement-tasks
description: >
  Implement every remaining task in a groomed plan unattended — the end-to-end "orchestrator"
  mode. Use when the user says implement-tasks, implement the whole plan, or drive it
  automatically after my-plan-to-tasks. Do NOT use for manual one-task-at-a-time progress; use
  my-implement-task for conductor mode instead.
version: 1.5.0
---

# /my-implement-tasks

Drive a groomed plan to completion unattended: one task at a time, each implemented in a fresh
context, each verified and committed before the next begins.

## When to use

Invoke:

```text
/my-implement-tasks {name}
```

Use this when the user wants the whole groomed plan driven end-to-end without stopping after
each task.

If no name is given:

1. Check the `.plan` symlink at the repo root. If it resolves to a directory under `.plans/`, use
   that plan and tell the user which one.
2. If the symlink is missing or broken, run `ls .plans/` and output the list of available plans
   to the user, then ask which one to work on. Do not proceed until they answer.

Either way, once `{name}` is resolved, point `.plan` at it: `ln -sfn .plans/{name} .plan`.

This skill is the async/multi-task counterpart to `/my-implement-task`. `/my-implement-task`
implements one task inline and stops so a human can look — the "conductor" mode. This skill
always dispatches each task to an isolated subagent and keeps going on its own, only stopping
when it's actually stuck — the "orchestrator" mode. Read `/my-implement-task`'s SKILL.md first
if you haven't; this skill reuses the shared per-task machinery
([`references/implementation-contract.md`](references/implementation-contract.md),
[`references/trajectory-audit.md`](references/trajectory-audit.md)) rather than redefining it.

## When NOT to use

- Do not use this when the user wants to inspect, review, or steer each task before the next
  begins. Use `/my-implement-task` for that manual conductor flow.
- Do not continue retrying or attempting further tasks after the halt conditions in step 6 are
  met.

## Process

### 1. Load the plan

Read `.plans/{name}/tasks.md` in full to get every task's title, status, and dependency list.

### 2. Check the working branch

Run `git branch --show-current`. If you are on the default branch (`main`/`master`), stop and
ask the user which branch to use or whether to create one. Do not assume a branch name.

### 3. Require a clean working tree

Run `git status --porcelain`. If it is non-empty, stop and tell the user to commit or stash
first. This loop commits automatically after every task — starting from a dirty tree risks
sweeping unrelated changes into the first commit.

### 4. Build the task queue

From `tasks.md`, note for every task: its status (`todo`/`done`/`blocked`), and its `Depends on`
list.

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

### 5. The loop

Repeat the following until told to stop by 5.1 or 5.6.

#### 5.1 Pick the next task

The next candidate is the first task in file order that is not in `done`, not in `blocked`, and
whose every dependency is in `done`.

- If no candidate exists but incomplete tasks remain, everything left depends on (or is)
  something blocked. Go to **6. Halt**.
- If no candidate exists and every task is in `done`, go to **7. Wrap up**.
- If the candidate's `tasks.md` Tier column is `draft-only`, go to **6a. Halt for a
  draft-only task** instead of dispatching it — do not attempt to autonomously implement
  it, and do not treat this as a failure or count it toward `consecutive_escalations`.

#### 5.2 Implement

Look up this task's tier in `tasks.md`'s `Tier` column (loaded in step 1) — a `{weight}/{orientation}`
pair (e.g. `lightweight/generator` or `powerful/generalist`). If present, resolve it against
`model-matrix.md`'s weight × orientation table (repo-local `{repo root}/.agents/model-matrix.md` if
present, else `~/.pi/agent/model-matrix.md` — see `~/.pi/agent/extensions/model-matrix/general.md`
for the resolution order; weight = row, orientation = column)
and use the matching `provider/model-id` as the `model` param and the matching `thinkingLevel` as
the `thinkingLevel` param on the dispatch below. If the tier is absent, doesn't parse as a known
`{weight}/{orientation}` pair, or `model-matrix.md` doesn't exist, dispatch with no `model`
override and no `thinkingLevel` override — don't halt the loop over a missing mapping.

Dispatch the task to an isolated subagent (e.g. the generic `worker` agent via the `subagent`
tool) with [`references/implementation-contract.md`](references/implementation-contract.md)'s
contents as its task instructions, plus only: the plan name and the task file path. Do not
pre-paste `AGENTS.md`, instruction-file, or ARD contents into the dispatch — the contract
resolves and reads all of that itself from the paths you give it. Always dispatch — this skill
never implements a task directly in the current session; that's what `/my-implement-task` is
for. One task, one fresh subagent context per pass — never batch multiple tasks together.

#### 5.3 Verify the report

The dispatched subagent's self-report is not verification — this is an eval, not a courtesy
re-check. Dispatch a second subagent with
[`references/trajectory-audit.md`](references/trajectory-audit.md) and the implementing
subagent's full final report verbatim, asking it to check the report's claims against live repo
evidence (changed files, reproduced test output, scope discipline, hard-constraint compliance,
hallucinated references).

Resolve this dispatch's `model`/`thinkingLevel` per the Reviewer rules in
`~/.pi/agent/extensions/model-matrix/general.md`: default is the exact same `model`/`thinkingLevel`
the 5.2 dispatch just used for this task, unless `model-matrix.md`'s Reviewer overrides
table has a row for this task's weight/orientation or this specific task — a fresh context at the same tier is what buys the independent check, not a
heavier model by default. Same fallback as 5.2 if nothing resolves: no override, keep going.

- "Resolve yourself" means acting on evidence the audit report already pasted in — flipping a
  status field, updating `tasks.md`, re-reading a claim you can settle from the audit's own
  quoted output. If resolving it would take any new tool call (re-running a command, catting a
  file, grepping for a symbol) you have not already seen, that's a fresh investigation, not a
  resolve-yourself — treat it as a real blocker and go to **5.5** instead of doing that
  investigation here. The orchestrator loop is not the place to re-derive what a subagent was
  dispatched to determine.
- Otherwise: if the audit's blockers are the kind you can resolve from evidence already in hand —
  resolve them and continue to 5.4. This does not count as a strike.
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
   Dispatch to an isolated subagent — keeps this out of the orchestrator's own context, same
   reasoning as 5.2/5.3.
4. Check the diff against [`references/spec-review-criteria.md`](references/spec-review-criteria.md),
   using **the task file itself** as the spec — not the plan's `prd.md`. The task's own
   "Acceptance Criteria" and "Interfaces" sections are the requirements to check the diff
   against; the PRD is the wrong scope here because most PRD requirements legitimately belong to
   other tasks, and this would flag all of them as `missing`. Dispatch to an isolated subagent,
   same as step 3.

**Gate fails** if the standards check reports any `hard violation` row, or the spec check reports
any `missing`/`partial`/`wrong` row. A `judgement call` or `scope creep` row alone does not fail
the gate — carry it into the final report (7 or 6) as a note, not a blocker.

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
- Recompute `consecutive_escalations` per step 4's rule. If it is now `3`, go to **6. Halt**
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

Add the task to `done`. Go back to **5.1**.

### 6. Halt (circuit breaker)

Stop the loop. Do not attempt any further task this run. Report to the user:

- Every task completed and committed so far, in order.
- Every blocked task, with its exact reason.
- Any task left un-attempted because it depends on a blocked task.

Three consecutive escalations means something systemic is wrong — a bad grooming pass, a broken
environment, the wrong branch — not that any individual task needs one more retry. Hand it to
the user rather than continuing to spend turns on it.

### 6a. Halt for a draft-only task

This is not a failure and does not count toward `consecutive_escalations` — it's an expected
stop, the same way `/my-plan-to-tasks` intended when it tagged the task. Report to the user:

- Every task completed and committed so far, in order.
- The draft-only task that stopped the loop, and its title/number.
- Instruct the user to run `/my-implement-task {name}` to complete that one task manually (its
  inline conductor mode is exactly what a draft-only task needs), then re-invoke
  `/my-implement-tasks {name}` to resume — loop state is derived from `tasks.md`/task-file status
  on disk, so resuming picks up cleanly once that task is marked `done`.

### 7. Wrap up (all tasks done)

Report every task completed and committed, in order. Call out any `judgement call`/`scope creep`
rows the gate let through — they didn't block a commit, but they're worth a human glance.
Suggest `/my-review main` for a final holistic pass before pushing or opening a PR.

## Output format

On halt (circuit breaker), report:

- every task completed and committed so far, in order
- every blocked task, with its exact reason
- any task left un-attempted because it depends on a blocked task

On halt for a draft-only task, report:

- every task completed and committed so far, in order
- the draft-only task that stopped the loop
- the instruction to run `/my-implement-task {name}` for that task, then resume `/my-implement-tasks {name}`
- any task left un-attempted because it depends on the draft-only task

On full completion, report:

- every task completed and committed, in order
- any `judgement call`/`scope creep` rows that did not block the gate
- `/my-review main` as the suggested final holistic pass before pushing or opening a PR

## Anti-patterns to avoid

- Never batch multiple tasks into one implementation pass or dispatch. One task, one fresh
  context, every time — that isolation is what makes the loop trustworthy.
- Never implement a task directly in the current session. Always dispatch — use
  `/my-implement-task` if inline execution is what's wanted.
- Never commit files the task didn't touch.
- Never commit secrets, credentials, or `.env` files.
- This skill commits automatically; `/my-implement-task` does not — that's the entire behavioral
  trade the loop makes for autonomy.
- If the user interrupts mid-loop, whatever is already committed stays committed. Don't roll
  anything back automatically.
- The full-suite CI gate isn't a separate step here — it's the plan's final task, which depends
  on every other task, so 5.1 can only ever select it last.
- Do not halt the loop or ask the user because a task has no tier or `model-matrix.md`
  is missing — fall back to no `model` override and keep going.
- Do not dispatch a `draft-only` task to a subagent under any tier — halt per 6a and defer
  to `/my-implement-task` instead.

---
name: my-implement-tasks
description: >
  Implement every remaining task in a groomed plan unattended — the end-to-end "orchestrator"
  mode, with independent ready tasks dispatched in parallel when the dependency graph allows it.
  Use when the user says implement-tasks, implement the whole plan, or drive it automatically
  after my-plan-to-tasks. Do NOT use for manual one-task-at-a-time progress; use
  my-implement-task for conductor mode instead.
version: 2.3.0
---

# /my-implement-tasks

Drive a groomed plan to completion unattended: ready tasks can be dispatched in parallel when the
dependency graph says they're independent, each still implemented in a fresh context and each
committed once it reports `DONE`.

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
dispatches ready tasks to isolated subagents and keeps going on its own, batching independent
work in parallel when the dependency graph permits it — the "orchestrator" mode. Read
`/my-implement-task`'s SKILL.md first if you haven't; this skill reuses the shared per-task
machinery ([`references/implementation-contract.md`](references/implementation-contract.md)) rather
than redefining it.

This skill trusts each dispatched subagent's own final report — it does not re-audit or re-run
tests after the fact. That trust rests on two things being true of a groomed plan: task files
carry literal, checkable Acceptance Criteria (not vague judgement calls), and `/my-review` is the
intended holistic pass once every task lands. Re-verifying per task here would just repeat work
twice for no new coverage — if that stops being true for a given plan (thin task files, no
follow-up review planned), fall back to `/my-implement-task`'s manual mode instead of pushing
this skill to compensate.

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

Branch and status checks are independent read-only operations; run them in one parallel tool batch when available.

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

Repeat the following until told to stop by 5.1 or 5.4.

#### 5.1 Pick the next task batch

The ready set is every task in file order that is not in `done`, not in `blocked`, and whose
every dependency is in `done`.

- If the ready set is empty but incomplete tasks remain, everything left depends on (or is)
  something blocked. Go to **6. Halt**.
- If the ready set is empty and every task is in `done`, go to **7. Wrap up**.
- If the first unresolved task in file order is `draft-only`, go to **6a. Halt for a
  draft-only task** instead of dispatching it — do not attempt to autonomously implement
  it, and do not treat this as a failure or count it toward `consecutive_escalations`.
- Otherwise, dispatch the whole ready set in one parallel batch, in file order, as long as the
  tasks are independent of one another (no direct dependency between tasks in the batch, no
  obvious shared-file conflict). If the batch is not obviously independent, serialize it instead.

#### 5.2 Implement (and trust the report)

Look up each task's tier in `tasks.md`'s `Tier` column (loaded in step 1) — a
`{weight}/{orientation}` pair (e.g. `lightweight/generator` or `powerful/generalist`). If present,
resolve it against `model-matrix.md`'s weight × orientation table (repo-local
`{repo root}/.agents/model-matrix.md` if present, else `~/.pi/agent/model-matrix.md` — see
`~/.pi/agent/extensions/model-matrix/general.md` for the resolution order; weight = row,
orientation = column) and use the matching `provider/model-id` as the `model` param and the
matching `thinkingLevel` as the `thinkingLevel` param on each dispatch. If the tier is absent,
doesn't parse as a known `{weight}/{orientation}` pair, or `model-matrix.md` doesn't exist,
dispatch with no `model` override and no `thinkingLevel` override — don't halt the loop over a
missing mapping.

Dispatch each ready task in the batch to an isolated subagent (e.g. the generic `worker` agent via
the `subagent` tool's `tasks` array in parallel mode) with
[`references/implementation-contract.md`](references/implementation-contract.md)'s contents as
its task instructions, plus only: the plan name and the task file path. Do not pre-paste
`AGENTS.md`, instruction-file, or ARD contents into the dispatch — the contract resolves and reads
all of that itself from the paths you give it. Always dispatch — this skill never implements a
task directly in the current session; that's what `/my-implement-task` is for. Each task still
gets a fresh subagent context; the only difference is that independent tasks may share a single
parallel batch when the dependency graph says it's safe.

When the batch reports back, take each Status at face value — no second subagent re-checks the
diff, no re-running tests it already ran in Step 3 of the contract. The task's Acceptance
Criteria are the spec; the report either says it met them with evidence (test output, files
changed) or it says BLOCKED. There is no third, ambiguous outcome to adjudicate.

- If Status is `DONE`, go to **5.3**.
- If Status is `BLOCKED`, go to **5.4** — no retry, straight to escalation (see 5.4 for why).

#### 5.3 Commit and continue

Mark each task done, same as `/my-implement-task` step 4b:

- Task file: `_Status: todo_` → `_Status: done_`.
- `tasks.md`: status cell `todo` → `done`, progress count updated.

Stage only the files the implementation step reported changed, cross-checked against
`git diff HEAD --stat` — never `git add -A` or `git add .`. For each task, commit separately:

```text
git add {only this task's changed files}
git commit -m "{type}: {task title, imperative}"
```

Infer `type` (`feat`/`fix`/`refactor`/`test`/`chore`) from the task's content, same judgement
`/my-review`'s commit step uses.

Add each task to `done`. Parallel dispatch is allowed; parallel commits are not. The whole batch
may finish together, but one task still lands as one commit. When every task in the batch is
processed, go back to **5.1**.

#### 5.4 Escalate

Do not dispatch a retry. A `BLOCKED` report already means the subagent exhausted the
implementation contract's own escalation rules — same command failing twice, same criterion
failing three separate fix attempts — with the full task/ARD/context/AGENTS.md reading from its
Step 1 already in hand. A fresh subagent retry would pay that entire discovery cost again just
to arrive back at the same wall; it has no new information the first subagent lacked. Escalate
immediately instead:

- Add it to `blocked`: set its `tasks.md` status cell to `blocked`, and write the exact BLOCKED
  reason into that task's file under a `## Blocked` section.
- Recompute `consecutive_escalations` per step 4's rule. If it is now `3`, go to **6. Halt**
  immediately.
- Otherwise, go back to **5.1** and continue with any remaining eligible tasks.

### 6. Halt (circuit breaker)

Stop the loop. Do not attempt any further task this run. Report to the user:

- Every task completed and committed so far, in order.
- Every blocked task, with its exact reason.
- Any task left un-attempted because it depends on a blocked task.

Three consecutive escalations means something systemic is wrong — a bad grooming pass, a broken
environment, the wrong branch — not that persisting would help. Hand it to the user rather than
continuing to spend turns on it.

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

Report every task completed and committed, in order. Suggest `/my-review main` for a final
holistic pass before pushing or opening a PR — that pass, not a per-task gate, is where
standards/spec conformance across the whole plan actually gets checked.

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
- `/my-review main` as the suggested final holistic pass before pushing or opening a PR

## Anti-patterns to avoid

- Never dispatch a parallel batch when some tasks are not truly independent — a ready task that
  still depends on another task in the same batch, or an obvious shared-file conflict, must be
  serialized instead.
- Use parallel tool calls for independent read-only orchestration work, but never overlap formatters,
  git mutations, commits, or commands sharing files, ports, databases, caches, or output paths.
- Never implement a task directly in the current session. Always dispatch — use
  `/my-implement-task` if inline execution is what's wanted.
- Never commit files the task didn't touch.
- Never commit secrets, credentials, or `.env` files.
- This skill commits automatically; `/my-implement-task` does not — that's the entire behavioral
  trade the loop makes for autonomy.
- If the user interrupts mid-loop, whatever is already committed stays committed. Don't roll
  anything back automatically.
- Do not dispatch a second subagent to re-check a task's report, and do not re-run tests or
  re-diff a task after its subagent reports DONE. The contract's own Step 3 already ran targeted
  CI; trust that report and move on — `/my-review main` at the end is the intended second look,
  not a per-task one.
- The full-suite CI gate isn't a separate step here — it's the plan's final task, which depends
  on every other task, so 5.1 can only ever select it last.
- Do not halt the loop or ask the user because a task has no tier or `model-matrix.md`
  is missing — fall back to no `model` override and keep going.
- Do not dispatch a `draft-only` task to a subagent under any tier — halt per 6a and defer
  to `/my-implement-task` instead.

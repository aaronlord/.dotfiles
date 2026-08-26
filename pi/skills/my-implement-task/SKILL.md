---
name: my-implement-task
description: >
  Implement the single next task from a groomed plan, then stop and wait — the manual,
  one-task-at-a-time "conductor" mode. Use when the user wants to drive each task by hand
  after my-plan-to-tasks. Do NOT use for unattended end-to-end execution; use my-implement-tasks
  for the orchestrator loop instead.
version: 2.3.0
---

# /my-implement-task

Implement exactly one task from a groomed plan, then stop.

## When to use

Invoke:

```text
/my-implement-task {name}
```

Use this after `/my-plan-to-tasks` when the user wants manual, one-task-at-a-time progress and a
stop point after each implemented task.

If no name is given:

1. Check the `.plan` symlink at the repo root. If it resolves to a directory under `.plans/`, use
   that plan and tell the user which one.
2. If the symlink is missing or broken, run `ls .plans/` and output the list of available plans
   to the user, then ask which one to work on. Do not proceed until they answer.

Either way, once `{name}` is resolved, point `.plan` at it: `ln -sfn .plans/{name} .plan`.

## When NOT to use

- Do not use this for unattended multi-task execution. Use `/my-implement-tasks` when the user
  wants the whole groomed plan driven end-to-end without stopping after each task.
- Do not begin the next task after finishing one. This skill implements one task only.

## Process

### 1. Load the plan

Read `.plans/{name}/tasks.md` to understand overall progress and dependency order.

### 2. Check the working branch

Run `git branch --show-current`. If you are on the default branch (e.g. `main` or `master`),
**stop and ask the user** which branch to use or whether to create one. Do not assume a branch
name. Do not create a branch without explicit confirmation.

### 3. Determine which task(s) to implement

Pick the next uncompleted task in order. If there's no such task (all done, or blocked), tell
the user why and stop.

### 3a. Implement inline

This skill always implements the task **inline, in this session** — never dispatched to a
subagent. (`/my-implement-tasks` is the subagent-dispatch counterpart; this skill is the manual
mode where the user watches each task happen directly.)

The actual implementation contract — read-order, SOLID, TDD discipline, targeted CI, escalation
rules, hard constraints, output format — lives in one place:
[`references/implementation-contract.md`](references/implementation-contract.md). This skill
never duplicates that prose.

Read `references/implementation-contract.md` now, in full, and follow it directly in this
session for the task at `.plans/{name}/tasks/{nnn}-task-name.md`. When it finishes (or reports
BLOCKED per its own escalation rules — stop and escalate to the user, do not attempt to route
around it yourself), continue to step 4.

### 4. After implementation: orchestrator-only steps

Everything below is the orchestrator's job — it happens after the inline implementation step has
produced a working, tested task, never before.

#### 4a. Full-suite CI — final task only

Targeted, per-task CI (formatter, type-checker, the tests covering this task's change) already
happened inside the implementation step above — do not re-run that here.

After implementing the **last** task in the plan, run the full CI pipeline including coverage
checks. Fix any failures before proceeding. If the full suite reveals a gap in earlier tasks, fix
it in the current commit — do not go back and amend previous commits.

#### 4b. Mark the task done

Update the task file: change `_Status: todo_` to `_Status: done_`.

Update `tasks.md`:

- Change the task's status cell from `todo` to `done`
- Update the progress count at the bottom

#### 4c. Stop

Report the completed task, the files changed, and how many tasks remain. Suggest the user run
`/my-review` to review and commit the changes before continuing — e.g. `/my-review main`. Do not
begin the next task under any circumstances.

If this was the final task (all tasks now done), say so and suggest `/my-review main` to review
everything against the PRD and the project's coding standards before pushing.

## Output format

Report:

- the completed task
- the files changed
- how many tasks remain
- `/my-review main` as the suggested next step

If all tasks are now done, say so and still suggest `/my-review main` before pushing.

## Anti-patterns to avoid

- Never skip a failing CI step. Fix it or stop and explain — this applies to the orchestrator's
  Phase-2 full-suite gate as much as to the implementation contract's targeted checks.
- Do not commit. Committing is the reviewer's responsibility, not this skill's and not the
  implementation step's.
- Never commit secrets, credentials, or `.env` files.
- Never dispatch this task to a subagent. This skill is the inline/manual mode by design — use
  `/my-implement-tasks` if you want subagent dispatch.
- The 3-attempt escalation rule, the "task is much bigger than it looked" flag, and the "design
  changed mid-implementation" rule all live in
  [`references/implementation-contract.md`](references/implementation-contract.md) now — if
  you're the orchestrator receiving a BLOCKED report for one of these, that's your cue to stop
  and ask the user, per the contract's own escalation rules, not to route around it yourself.

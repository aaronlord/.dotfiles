---
name: my-implement-task
description: >
  Implement the single next task from a groomed plan, then stop and wait — the manual,
  one-task-at-a-time "conductor" mode. Use when the user wants to drive each task by hand
  after my-plan-to-tasks. Do NOT use for unattended end-to-end execution; use my-implement-tasks
  for the orchestrator loop instead.
version: 1.0.0
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

1. Run `ls .plans/` and output the list of available plans to the user.
2. Ask the user which plan to work on. Do not proceed until they answer.

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

### 3a. Choose execution mode

Ask the user once per `/my-implement-task` invocation, unless they already stated a preference
earlier in this session:

> "Implement this task inline in this session, or dispatch it to a subagent (e.g. a cheaper model)? Reply `inline` or `subagent`."

Either way, the actual implementation contract — read-order, SOLID, TDD discipline, targeted
CI, escalation rules, hard constraints, output format — lives in one place:
[`references/implementation-contract.md`](references/implementation-contract.md). This skill
never duplicates that prose; it only decides who executes it and verifies the result.

**If `inline`:** Read `references/implementation-contract.md` now, in full, and follow it
directly in this session for the task at `.plans/{name}/tasks/{nnn}-task-name.md`. When it
finishes (or reports BLOCKED per its own escalation rules), continue to step 4.

**If `subagent`:**

1. Dispatch a subagent (e.g. via the `subagent` tool's generic `worker` agent) with
   `references/implementation-contract.md`'s contents as its task instructions, plus only: the
   plan name and the task file path. Do not pre-paste `AGENTS.md`, instruction-file, or ARD
   contents into the dispatch — the contract resolves and reads all of that itself from the
   paths you give it.
2. One task per dispatch call — never batch multiple tasks into one dispatch.
3. When the subagent reports back, do not treat its self-report as verification — this is an
   eval, not a courtesy re-check. Dispatch a second subagent with
   [`../my-implement-tasks/references/trajectory-audit.md`](../my-implement-tasks/references/trajectory-audit.md)
   and the first subagent's full final report verbatim, asking it to check the report's claims
   against live repo evidence (changed files, reproduced test output, scope discipline,
   hard-constraint compliance, hallucinated references) — it is not re-reviewing code quality,
   only whether the report can be trusted.
4. Read the verification verdict. Any blocker-level finding means the report cannot be trusted
   as-is:
   - If the blocker is fixable by re-running or clarifying (e.g. it merely under-reported a
     file), resolve it yourself using the surfaced evidence, or re-dispatch the implementation
     step once with the specific gap named.
   - If the blocker indicates the work itself is wrong or a hard constraint was violated, treat
     it the same as a BLOCKED report — stop and escalate to the user, do not paper over it.
   - Lower-severity findings don't block proceeding, but surface them to the user alongside the
     task summary in step 4c.
5. If the implementation step itself reports BLOCKED, read its stated reason. If you can resolve
   it yourself (missing context, an unclear instruction), fix it and re-dispatch once. If it
   reports BLOCKED a second time for the same task, stop and escalate to the user — do not
   attempt a third dispatch.

### 4. After implementation: orchestrator-only steps

Everything below is the orchestrator's job — it happens after the implementation step (inline or
dispatched) has produced a working, tested task, never before.

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
- any lower-severity verification findings from step 3a
- `/my-review main` as the suggested next step

If all tasks are now done, say so and still suggest `/my-review main` before pushing.

## Anti-patterns to avoid

- Never skip a failing CI step. Fix it or stop and explain — this applies to the orchestrator's
  Phase-2 full-suite gate as much as to the implementation contract's targeted checks.
- Do not commit. Committing is the reviewer's responsibility, not this skill's and not the
  implementation step's.
- Never commit secrets, credentials, or `.env` files.
- The 3-attempt escalation rule, the "task is much bigger than it looked" flag, and the "design
  changed mid-implementation" rule all live in
  [`references/implementation-contract.md`](references/implementation-contract.md) now — if
  you're the orchestrator receiving a BLOCKED report for one of these, that's your cue to stop
  and ask the user, not to re-dispatch a fix yourself beyond the one retry allowed in step 3a.

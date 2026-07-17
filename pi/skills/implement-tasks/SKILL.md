---
name: implement-tasks
description: Loop through every remaining task in a groomed plan unattended (the "orchestrator" mode) — dispatch `implementer` per task in a fresh context, verify with `trajectory-auditor`, gate on standards/spec conformance, retry once on a real violation, commit, then move to the next task automatically. Halts on 3 consecutive escalations rather than grinding forward. Use when the user wants the whole plan driven end-to-end without stopping after each task. For the manual one-task-at-a-time mode, see /implement-task.
---

# /implement-tasks

Drive a groomed plan to completion unattended: one task at a time, each implemented in a fresh context, each verified and committed before the next begins.

This skill is the async/multi-task counterpart to `/implement-task`. `/implement-task` implements one task and stops so a human can look — the "conductor" mode. This skill keeps going on its own, only stopping when it's actually stuck — the "orchestrator" mode. Read `/implement-task`'s SKILL.md first if you haven't; this skill reuses its per-task machinery (`implementer.md`, `trajectory-auditor`) rather than redefining it.

## Invocation

```
/implement-tasks {name}
```

If no name is given:
1. Run `ls .plans/` and output the list of available plans to the user.
2. Ask the user which plan to work on. Do not proceed until they answer.

## Process

### 1. Load the plan

Read `.plans/{name}/tasks.md` in full to get every task's title, status, and dependency list.

### 2. Check the working branch

Run `git branch --show-current`. If you are on the default branch (`main`/`master`), stop and ask the user which branch to use or whether to create one. Do not assume a branch name.

### 3. Require a clean working tree

Run `git status --porcelain`. If it is non-empty, stop and tell the user to commit or stash first. This loop commits automatically after every task — starting from a dirty tree risks sweeping unrelated changes into the first commit.

### 4. Build the task queue

From `tasks.md`, note for every task: its status (`todo`/`done`/`blocked`), and its `Depends on` list.

All loop state below is derived from disk, not held only in memory — the orchestrator's own session is not reset between tasks the way each subagent dispatch is, and generic auto-compaction could otherwise summarize away an in-memory blocked-list or counter mid-run. Re-derive on every pass through 5.1 rather than trusting a running tally:

- `done` — tasks whose status cell is `done`.
- `blocked` — tasks whose status cell is `blocked`. When you add one, write the exact reason into that task's file under a `## Blocked` section, and set its `tasks.md` status cell to `blocked` (not `todo`) — this is what makes the block durable across a compaction.
- `consecutive_escalations` — recompute it by walking `tasks.md` in file order and counting the trailing run of `blocked` statuses immediately preceding the current position, resetting the count at the most recent `done`. Don't keep this only as a mental counter.

### 5. The loop

Repeat the following until told to stop by 5.1 or 5.6.

#### 5.1 Pick the next task

The next candidate is the first task in file order that is not in `done`, not in `blocked`, and whose every dependency is in `done`.

- If no candidate exists but incomplete tasks remain, everything left depends on (or is) something blocked. Go to **6. Halt**.
- If no candidate exists and every task is in `done`, go to **7. Wrap up**.

#### 5.2 Implement

Dispatch the `implementer` subagent with only the plan name and this task's file path — exactly as `/implement-task`'s subagent branch does. One task, one fresh context, one dispatch call.

#### 5.3 Verify the report

Dispatch `trajectory-auditor` with `implementer.md` and `implementer`'s full report, exactly as `/implement-task` step 3a.3 does.

- If `trajectory-auditor`'s blockers are the kind you can resolve yourself (it merely under-reported something, evidence is available to fix directly) — resolve them yourself and continue to 5.4. This does not count as a strike.
- If a blocker means the work is actually wrong, or `implementer` itself reported BLOCKED — this task has failed this attempt. Skip to **5.5**.

#### 5.4 Lightweight quality gate

Skip this step entirely for the plan's final "Ensure CI passes" task — its acceptance criteria are procedural (commands pass or they don't), not feature requirements, and `trajectory-auditor` already re-runs the exact commands it claims to have run.

For every other task:

1. Get the task's diff: `git diff HEAD --stat` for the file list, `git diff HEAD` for content. This is uncommitted — nothing has landed yet.
2. Locate the standards sources that apply to the changed files: `AGENTS.md` (root + path-level), and every `.github/instructions/*.instructions.md` whose `applyTo:` glob matches a changed file — same lookup `/review` step 3 does. Build the file → instruction-file map.
3. Dispatch `standards-reviewer` with: the diff, the located standards sources (full content), and the file → instruction-file map.
4. Dispatch `spec-reviewer` with: the diff, and **the task file itself** as the spec — not the plan's `prd.md`. The task's own "Acceptance Criteria" and "Interfaces" sections are the requirements to check the diff against; the PRD is the wrong scope here because most PRD requirements legitimately belong to other tasks, and `spec-reviewer` would flag all of them as `missing`.

**Gate fails** if `standards-reviewer` reports any `hard violation` row, or `spec-reviewer` reports any `missing`/`partial`/`wrong` row. A `judgement call` or `scope creep` row alone does not fail the gate — carry it into the final report (7 or 6) as a note, not a blocker.

If the gate passes, go to **5.6**. If it fails, go to **5.5**.

#### 5.5 Retry once, then escalate

If this task has not yet been retried in this run: re-dispatch `implementer` once, naming the exact failing finding(s) verbatim (file:line, rule or spec ref, and the reviewer's recommendation). Go back to 5.2 for this same task.

If this is the second failure for this task (retry already used): this task is an **escalation**.

- Add it to `blocked`: set its `tasks.md` status cell to `blocked`, and write the exact reason (the BLOCKED message, or the finding that recurred) into that task's file under a `## Blocked` section.
- Recompute `consecutive_escalations` per step 4's rule. If it is now `3`, go to **6. Halt** immediately.
- Otherwise, go back to **5.1** and try the next available task.

#### 5.6 Commit and continue

Mark the task done, same as `/implement-task` step 4b:
- Task file: `_Status: todo_` → `_Status: done_`.
- `tasks.md`: status cell `todo` → `done`, progress count updated.

Stage only the files `implementer` reported changed, cross-checked against `git diff HEAD --stat` — never `git add -A` or `git add .`. Commit:

```
git add {only this task's changed files}
git commit -m "{type}: {task title, imperative}"
```

Infer `type` (`feat`/`fix`/`refactor`/`test`/`chore`) from the task's content, same judgement `/review`'s commit step uses.

Add the task to `done`. Go back to **5.1**.

### 6. Halt (circuit breaker)

Stop the loop. Do not attempt any further task this run. Report to the user:

- Every task completed and committed so far, in order.
- Every blocked task, with its exact reason.
- Any task left un-attempted because it depends on a blocked task.

Three consecutive escalations means something systemic is wrong — a bad grooming pass, a broken environment, the wrong branch — not that any individual task needs one more retry. Hand it to the user rather than continuing to spend turns on it.

### 7. Wrap up (all tasks done)

Report every task completed and committed, in order. Call out any `judgement call`/`scope creep` rows the gate let through — they didn't block a commit, but they're worth a human glance. Suggest `/review main` for a final holistic pass before pushing or opening a PR.

## Notes

- Never batch multiple tasks into one `implementer` dispatch. One task, one fresh context, every time — that isolation is what makes the loop trustworthy.
- Never commit files the task didn't touch.
- Never commit secrets, credentials, or `.env` files.
- This skill commits automatically; `/implement-task` does not — that's the entire behavioral trade the loop makes for autonomy.
- If the user interrupts mid-loop, whatever is already committed stays committed. Don't roll anything back automatically.
- The full-suite CI gate isn't a separate step here — it's the plan's final task, which depends on every other task, so 5.1 can only ever select it last.
</content>

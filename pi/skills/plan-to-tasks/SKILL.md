---
name: plan-to-tasks
description: Break a reviewed ARD into an ordered list of independently-implementable tasks. Creates tasks.md (index) and tasks/{n}-task-name.md (individual task files with full context). Use after /review-plan when the plan is ready to be broken down for implementation.
disable-model-invocation: true
---

# /plan-to-tasks

Break a reviewed ARD into an ordered, dependency-aware list of tasks ready for implementation.

## Invocation

The user passes the plan name (matching the directory under `.plans/`). If no name is given, list the available plans and ask which one to groom.

## Process

### 1. Load the plan — read before asking

Given the plan name, read both files immediately — before asking the user any questions about goals, context, or scope. The plan files are the source of truth.

- `.plans/{name}/prd.md` — user story, problem statement, goals
- `.plans/{name}/ard.md` — architecture decisions (primary source for task derivation)

If either file is missing, tell the user which one and stop. If the ARD status is still `draft` rather than `reviewed`, warn the user that running `/review-plan` first is strongly recommended, but proceed if they confirm. Only ask the user questions if something remains genuinely unclear after reading both files.

### 2. Load codebase context

Read `.plans/{name}/context.md`. This was written during `/plan` and contains all codebase exploration findings. Use it as your starting point — don't re-do broad discovery. Then do targeted exploration of the specific code this plan will touch, looking for:

- Prefactoring opportunities: "make the change easy, then make the easy change" — if existing code needs restructuring to make the implementation cleaner, that's a task too
- Natural implementation order based on dependencies (schema before repositories, interfaces before implementations, etc.)
- Prior art for similar tasks in the project

### 3. Derive tasks as vertical slices

Break the work into **tracer bullet** tasks — minimal, end-to-end slices through the system that validate architecture and dependencies before building full scope. Each task should be a thin vertical slice that:

- Is independently implementable and reviewable
- Has a clear, verifiable outcome
- Can be described as a conventional commit message (imperative, specific)

Avoid horizontal slices (e.g. "all repositories" as one task). Each slice should cut through the layers it needs.

Order tasks so dependencies come first. Number them sequentially.

Always append one final task — **"Ensure CI passes"** — as the last item, depending on all other tasks. This task is not negotiable and must not be removed during the quiz. Its job is to run the full CI suite end-to-end and fix any failures (test coverage gaps, static analysis errors, formatting issues) that slipped through during individual task implementation.

### 4. Quiz the user on the breakdown

Present the proposed task list as a numbered list. For each task show:

- **Title**: short imperative description
- **What it covers**: which layers/files/concepts
- **Depends on**: which earlier tasks must complete first (if any)

Ask the user:

- Does the granularity feel right?
- Are the dependency relationships correct?
- Should any tasks be merged or split?

Iterate until the user approves the breakdown.

### 5. Write the task files

For each approved task, create `.plans/{name}/tasks/{nnn}-{task-slug}.md` (zero-padded three-digit index, e.g. `001-create-upsert-student-command.md`).

Before writing each task file, scan `.github/instructions/` for `*.instructions.md` files. Read the `applyTo:` frontmatter of each file and test whether any of the files the task will create or modify would match that glob. List every matching file path under `## Instruction Files` in the task. Do not copy content — just the path. If no files match, omit the section entirely.

The final **"Ensure CI passes"** task always uses the template below — populate it as shown:

<ci-gate-task-template>
# Task {n}: Ensure CI passes

_Status: todo_

## What

Run the full CI pipeline and fix any failures. This is the final gate before the feature branch is ready for review.

Run the project's full CI pipeline: formatter, type-checker/static analysis, and full test suite with coverage.

## Why

Individual tasks run targeted tests, so coverage gaps, cross-module type errors, and formatting drift can accumulate. This task ensures the branch is green end-to-end before going to review.

## Dependencies

All previous tasks.

## Acceptance Criteria

- [ ] Formatting passes with no changes
- [ ] Static analysis reports no errors
- [ ] All tests pass
- [ ] Coverage meets the project minimum (100% where enforced)

## Relevant ARD Sections

N/A — this task is a CI gate, not a feature.

## Notes

Do not skip or shortcut this task. If CI fails, fix the root cause — do not suppress warnings or lower thresholds.
</ci-gate-task-template>

For all other tasks, use the template below:

<task-template>
# Task {n}: {Title}

_Status: todo_

## What

A clear description of what this task implements. Be specific — name the files, classes, commands, jobs, or interfaces involved.

## Why

How this task fits into the overall feature. What it enables downstream.

## Dependencies

List any tasks that must be completed before this one, or `none`.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...

## Relevant ARD Sections

Quote or reference the specific parts of the ARD that drive this task's design decisions.

## Instruction Files

{List paths to any `.github/instructions/*.instructions.md` files whose `applyTo:` glob matches files this task will create or edit. Omit this section if none match.}

## Notes

Any implementation notes, gotchas, or prior art in the codebase worth reading first.
</task-template>

### 6. Write the tasks index

Create or overwrite `.plans/{name}/tasks.md`:

<tasks-index-template>
# Tasks: {Feature Name}

| #   | Task                                              | Status | Depends on |
| --- | ------------------------------------------------- | ------ | ---------- |
| 1   | [Task title](tasks/001-task-name.md)              | todo   | —          |
| 2   | [Task title](tasks/002-task-name.md)              | todo   | 1          |
| 3   | [Task title](tasks/003-task-name.md)              | todo   | 1, 2       |
| 4   | [Ensure CI passes](tasks/004-ensure-ci-passes.md) | todo   | all        |

## Progress

_0 / {total} tasks complete_
</tasks-index-template>

### 7. Wrap up

Tell the user:

- How many tasks were created
- The dependency order and any parallelism opportunities
- Next step: run `/implement-tasks {name}` to begin implementation

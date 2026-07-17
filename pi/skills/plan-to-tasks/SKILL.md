---
name: plan-to-tasks
description: Break a reviewed ARD into an ordered list of independently-implementable tasks. Creates tasks.md (index) and tasks/{n}-task-name.md (individual task files with full context). Use after /review-plan when the plan is ready to be broken down for implementation.
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

If either file is missing, tell the user which one and stop. If the ARD status is still `draft` rather than `reviewed`, stop and show this exact message, substituting the real plan name:

> ARD status is still `draft`. Running `/review-plan {name}` first is strongly recommended.
> Type `proceed` to groom this plan into tasks anyway, or run `/review-plan {name}` first.

Wait for the literal word `proceed`. Any other reply — including a vague "yes" — is not consent; ask what they'd like to do instead. Only ask the user questions if something remains genuinely unclear after reading both files.

### 2. Load codebase context

Read `.plans/{name}/context.md`. This was written during `/plan` and contains all codebase exploration findings. Use it as your starting point — don't re-do broad discovery. Then do targeted exploration of the specific code this plan will touch, looking for:

If `context.md` has a `## Reference Documents` section, read the cached `.plans/{name}/references/*.md` files it lists instead of re-fetching those URLs. If a task needs to cite one, cite the cached file path, not the raw URL. Only fetch a URL if it isn't already cached, then save and append it the same way `/plan` and `/review-plan` do.

If `context.md` has a `## Design References` section (Figma URL + fileKey/nodeId, recorded by `/plan`), figure out which task(s) implement which node(s) — a design reference belongs on whichever task actually builds that piece of UI, not on every task in the plan.

- Prefactoring opportunities: "make the change easy, then make the easy change" — if existing code needs restructuring to make the implementation cleaner, that's a task too
- Natural implementation order based on dependencies (schema before repositories, interfaces before implementations, etc.)
- Prior art for similar tasks in the project

### 3. Derive tasks as vertical slices

Break the work into **tracer bullet** tasks — minimal, end-to-end slices through the system that validate architecture and dependencies before building full scope. A task is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate: fold setup, configuration, and scaffolding into the task whose deliverable needs them, and split further only where a reviewer could reasonably approve one task while rejecting its neighbour.

Each task should be a thin vertical slice that:

- Is independently implementable and reviewable
- Has a clear, verifiable outcome
- Can be described as a conventional commit message (imperative, specific)

Avoid horizontal slices (e.g. "all repositories" as one task). Each slice should cut through the layers it needs.

Order tasks so dependencies come first. Number them sequentially.

Always append one final task — **"Ensure CI passes"** — as the last item, depending on all other tasks. This task is not negotiable and must not be removed during the quiz. Its job is to run the full CI suite end-to-end and fix any failures (test coverage gaps, static analysis errors, formatting issues) that slipped through during individual task implementation.

### 3a. Cross-consistency check

Before presenting the task list, check it against the PRD and ARD, item by item:

- Every user story in the PRD's "User Stories" section is covered by at least one task. If a story has no task, add one — do not proceed with a gap.
- Every non-CI task cites something concrete from the ARD (a module, command, handler, or decision) that you will quote under that task's "Relevant ARD Sections" in step 5. A task with nothing to cite is not derived from the plan — cut it or merge it into the task it actually belongs to.
- Every DTO/payload in the ARD's "Data Contracts" section is produced or consumed by at least one task. If one isn't, add it to the task that should own it.
- No two tasks name the same file or interface as their primary deliverable, unless one explicitly modifies what the other created.

Fix any gaps you find yourself before moving to step 4. Only mention this check to the user if it surfaced a gap you could not resolve on your own.

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

**First, find matching instruction files.** Before drafting a task's `## What`, scan `.github/instructions/` for `*.instructions.md` files. Read the `applyTo:` frontmatter of each and test it against the files this task will create or modify. For every match, read the file's content (not just its glob) — it already teaches the boilerplate: class shape, imports, DI pattern, naming, return types, folder conventions, example code. List every matching path under `## Instruction Files` in the task (path only, do not copy its content into the task).

**Then, check for a design reference.** If `context.md` has a `## Design References` section and this task builds the UI a listed Figma node covers, fill in the task's `## Design Reference` section (URL, fileKey, nodeId, and the pointer to `implement-figma-design`). Only one task per design node should claim it — don't duplicate the same reference across multiple tasks.

**Don't re-teach what the instruction file already teaches.** If a matching instruction file exists, the task's `## What` must not restate its boilerplate as a full code listing. Write it as: file path + method/function signature (name, params, return type) + what it does in plain terms (input → behavior → output), calling out only what's specific to this feature — a business rule, edge case, exact value, or deviation from the instruction file's default pattern (e.g. "no auth check here, unlike the standard controller rule, because this is a public page — see `IdleController` precedent"). The instruction file plus the acceptance criteria should be enough for the implementer to write the code; the task is not a code drop for copy-paste.

Only include an inline code snippet in `## What` when:
- No instruction file matches that file's type, or
- The instruction file's example doesn't cover the specific construct needed (a nonstandard control-flow, a tricky expression, a specific regex/algorithm) — show only that non-obvious fragment, not the whole file, or
- Exact wording matters and prose would be ambiguous (e.g. a route declaration, a config key, a migration's column list)

**No placeholders.** Every task file must still contain the actual content an implementer needs — many tasks will be implemented by a smaller, less capable model working from the task file alone, with no access to your reasoning or the conversation that produced it. Never write any of these in a task file:
- "TBD", "handle edge cases", "add appropriate error handling", "add validation" without saying what validation
- "Similar to Task N" without repeating the concrete detail — the implementer may never read Task N
- An acceptance criterion that isn't independently checkable (e.g. not "works correctly", but "returns 404 when the student ID does not exist")
- A reference to a type, function, method, or file that isn't named exactly, with its real path or signature

If you don't know an exact name, path, or signature, stop and check the codebase or the ARD before writing the task — do not guess and do not leave it vague. Precision about names and signatures is required even when the implementation code itself is left to the instruction file's conventions.

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

Per file touched: exact path, the signature (method/function name, params, return type), and what it does in plain terms — input → behavior → output. Name any business rule, edge case, exact value, or deviation from the matching instruction file's default pattern. Do not paste a full implementation for constructs already covered by a matching `## Instruction Files` entry — see step 5's rules on when an inline snippet is warranted.

## Why

How this task fits into the overall feature. What it enables downstream.

## Dependencies

List any tasks that must be completed before this one, or `none`.

## Interfaces

- **Consumes**: exact function/method/command signatures this task depends on from earlier tasks. Write `none` if this task has no upstream dependencies.
- **Produces**: exact function/method/command signatures, class names, or file paths this task creates that later tasks will depend on. Write `none` if nothing downstream depends on this task's output.
- **Data Contracts**: any DTO/payload from the ARD's "Data Contracts" section this task creates or consumes, with the exact property list and types copied in — not just the name. Write `none` if this task touches no data contract.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...

## Relevant ARD Sections

Quote or reference the specific parts of the ARD that drive this task's design decisions.

## Instruction Files

{List paths to any `.github/instructions/*.instructions.md` files whose `applyTo:` glob matches files this task will create or edit. Omit this section if none match. The implementer is expected to read these and follow their conventions — `## What` should not repeat what they already say.}

## Design Reference

{Omit this section entirely unless this task implements a piece of UI covered by a Figma design reference from `context.md`. If it applies: the exact Figma URL, `fileKey`, and `nodeId` this task implements, plus the instruction "Follow the `implement-figma-design` skill for this task's UI work." If the design reference only covers part of this task (e.g. one section of a larger page), say which part explicitly — don't make the implementer guess the boundary.}

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
- Next step: run `/implement-task {name}` to work through tasks one at a time, or `/implement-tasks {name}` to run the full loop unattended

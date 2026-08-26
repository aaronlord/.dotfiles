---
name: my-plan-to-tasks
description: >
  Break a reviewed plan into dependency-ordered task files and tasks.md. Use this skill when the
  user says plan to tasks, break the plan into tasks, or groom a reviewed ARD for
  implementation. Do NOT use for net-new planning (my-plan, my-quick-plan), follow-up changes to
  an existing plan (my-follow-up-plan), or pre-groom review (my-review-plan).
version: 1.14.0
---

# /my-plan-to-tasks

Break a reviewed ARD into an ordered, dependency-aware list of tasks ready for implementation.

## When to use

- The user passes the plan name (matching the directory under `.plans/`) and wants to break a reviewed plan into implementation tasks.
- If no name is given, check the `.plan` symlink at the repo root; if it resolves to a directory under `.plans/`, use that plan. If it's missing or broken, list the available plans and ask which one to groom.
- Use this after `/my-review-plan`, once the PRD and ARD are ready to be broken down for implementation.

## When NOT to use

- Do not use this skill for net-new planning work; use `/my-plan` for a persisted plan or `/my-quick-plan` for small inline planning.
- Do not use this skill when the user wants to continue, revise, or build on an existing plan with new follow-up scope; use `/my-follow-up-plan` instead.
- Do not use this skill when the plan still needs to be stress-tested, clarified, or reviewed before grooming; use `/my-review-plan` first.

## Process

### 1. Load the plan — read before asking

Resolve `{name}` per "When to use" above, then point `.plan` at it: `ln -sfn .plans/{name} .plan`.

Given the plan name, read both files immediately — before asking the user any questions about goals, context, or scope. The plan files are the source of truth.

- `.plans/{name}/prd.md` — user story, problem statement, goals
- `.plans/{name}/ard.md` — the agreed structure: file tree, data contracts, non-file items (primary source for task derivation)

The ARD is a **sketch, not a contract of completeness**. It carries the shape that was agreed; it deliberately omits rationale, testing notes, and detail. Filling that detail in is this skill's job — you may add files, tests, providers and migrations the tree doesn't list. What you may not do is contradict the tree: names, layering and directory placement in the ARD were taken from this codebase's own precedent and settled with the user. Follow that precedent for anything you add.

If either file is missing, tell the user which one and stop. If the ARD status is still `draft` rather than `reviewed`, stop and show this exact message, substituting the real plan name:

> ARD status is still `draft`. Running `/my-review-plan {name}` first is strongly recommended.
> Type `proceed` to groom this plan into tasks anyway, or run `/my-review-plan {name}` first.

Wait for the literal word `proceed`. Any other reply — including a vague "yes" — is not consent; ask what they'd like to do instead. Only ask the user questions if something remains genuinely unclear after reading both files.

### 2. Load codebase context

Read `.plans/{name}/context.md`. Written during `/my-plan` and extended by `/my-review-plan`, it holds the codebase findings, the precedent the ARD's structure was copied from, and the reasoning behind every settled decision — all the material the ARD deliberately doesn't carry. Read it before deriving tasks; it is where "why is it shaped like this" is answered. Use it as your starting point — don't re-do broad discovery. Then do targeted exploration of the specific code this plan will touch, looking for:

If `context.md` has a `## Reference Documents` section, read the cached `.plans/{name}/references/*.md` files it lists instead of re-fetching those URLs. If a task needs to cite one, cite the cached file path, not the raw URL. Only fetch a URL if it isn't already cached, then save and append it the same way `/my-plan` and `/my-review-plan` do.

- Prefactoring opportunities: "make the change easy, then make the easy change" — if existing code needs restructuring to make the implementation cleaner, that's a task too
- Natural implementation order based on dependencies (schema before repositories, interfaces before implementations, etc.)
- Prior art for similar tasks in the project

**Staleness check.** ARDs and previously-written task files drift from reality — designs move, code ships without status updates. Before deriving new tasks, verify the ARD's key claims against the current codebase: for every module, path, or interface the ARD names, confirm it actually exists at that location (or doesn't yet). If the plan already has a `tasks/` directory from a prior run, check whether any task marked `todo` has its target files already present on the default branch — a wrong or guessed path is far more expensive to an implementer than a missing detail, and a task claiming `todo` for already-shipped work is a silent trap.

### 3. Derive tasks as vertical slices

Break the work into **tracer bullet** tasks — minimal, end-to-end slices through the system that validate architecture and dependencies before building full scope. A task is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate: fold setup, configuration, and scaffolding into the task whose deliverable needs them, and split further only where a reviewer could reasonably approve one task while rejecting its neighbour.

Each task should be a thin vertical slice that:

- Is independently implementable and reviewable
- Has a clear, verifiable outcome
- Can be described as a conventional commit message (imperative, specific)

Avoid horizontal slices (e.g. "all repositories" as one task). Each slice should cut through the layers it needs.

Order tasks so dependencies come first. Number them sequentially.

Assign each non-CI task a **tier** — either `draft-only`, or a `{weight}/{orientation}` pair (per
`/my-implement-tasks`'s Action-Allowed tier; see
`~/.pi/agent/extensions/model-matrix/general.md`'s Authority ladder for what these three trust
levels mean):

**Weight** — capability/cost class:

- `lightweight`: mechanical/boilerplate work with no novel logic and no judgment needed — either the task file already spells out the exact contract (field names, types, shapes) verbatim, or the pattern has to be *derived* from a matching instruction file or an analogous example. Multi-file scaffolding (DTOs, resource classes, simple CRUD) still counts as `lightweight` when the contract is fully known — "more files" or "looks like a real feature" is not, by itself, a reason to bump up.
- `versatile`: typical feature work — some judgment, but no new architecture or high-risk surface.
- `powerful`: novel algorithm, cross-cutting refactor, or high-risk surface (security, auth-compat, money, compliance, data migration, a decision with no instruction-file precedent) — bump to `powerful` on stakes alone even when the task's apparent size or instruction-file coverage looks small.

This skill skews toward over-assigning weight — grooming tends to hedge up "to be safe." When torn
between two adjacent weights, default to the lower one; only bump up if you can name the specific
derivation/judgment/risk the lower tier can't handle, not a vague sense that the task "feels"
bigger.

**Split for tier, not just for slice.** A vertical slice that mixes fully-specified boilerplate
(DTOs, resource classes, migrations, generated types) with one judgment-heavy piece (a resolution
chain, a novel query, a UI interaction) drags the whole task up to the judgment piece's tier —
that's often wasteful, since the boilerplate portion could have been dispatched to a cheaper
model on its own. Before finalizing the breakdown, check each `versatile`/`powerful` task for a
sub-slice that is itself fully-specified and mechanical (e.g. "the DTO and repository interface"
out of "the DTO, repository, and resolution chain"); if one exists and can be its own reviewable,
testable unit, split it out as its own `lightweight` task instead of folding it
in. Only keep them merged when the boilerplate has no independent test/review value apart from the
harder piece (e.g. a single-field DTO that only the resolution chain consumes).

**Bias the overall mix toward cheap tiers.** Splitting for tier (above) catches boilerplate hiding inside one task; this is about the shape of the whole list. Wherever a clean cut is possible, prefer cutting finer at the `lightweight` end — a migration, a DTO, a config file, a repository skeleton, a mechanical rename each earn their own task rather than riding along with something harder. Coarser `versatile`/`powerful` tasks are still necessary for the genuinely hard parts, but they should not make up most of the list — if more than roughly half the tasks land `versatile` or `powerful`, re-scan for mechanical sub-slices you can peel off into their own cheap tasks before presenting the breakdown in step 4.

**Orientation** — what kind of capability the task needs:

- `generator`: execute an already-fully-specified pattern faithfully, especially bulk/repetitive work across many files (renames, module migrations, mechanical find/replace). Favors long-context instruction-following over a model "helpfully" reinterpreting scope mid-task.
- `generalist`: judgment calls, ambiguity, subtle correctness a straightforward test won't catch, cross-cutting design impact, or prose/instruction-writing. Favors reasoning depth and self-correction over raw throughput.

Treat thinking level as a separate dispatch knob from tier: use `low` for small, well-specified work, and raise to `medium`/`high` when the task needs judgment, ambiguity, or cross-cutting changes. `draft-only` overrides weight/orientation entirely — reserve it for tasks that are inherently about debate or ambiguity resolution rather than execution (e.g. drafting a contentious convention, a decision with no clear right answer worth grilling the user on). This should be rare; most tasks are executable and get a `{weight}/{orientation}` pair instead.

The tier only matters when a task is later implemented via a dispatched subagent (see `/my-implement-tasks`) — inline implementation via `/my-implement-task` ignores it, and `draft-only` tasks are exactly what that inline path is for. Leave the CI-gate task untiered; it's mechanical, not judgment-heavy.

Always append one final task — **"Ensure CI passes"** — as the last item, depending on all other tasks. This task is not negotiable and must not be removed during the quiz. Its job is to run the full CI suite end-to-end and fix any failures (test coverage gaps, static analysis errors, formatting issues) that slipped through during individual task implementation.

### 3a. Cross-consistency check

Before presenting the task list, check it against the PRD and ARD, item by item:

- Every user story in the PRD's "User Stories" section is covered by at least one task. If a story has no task, add one — do not proceed with a gap.
- Every non-CI task cites something concrete from the ARD or `context.md` (a file in the tree, a data contract, an item under Other, or a recorded decision) that you will quote under that task's "Relevant ARD Sections" in step 5. A task with nothing to cite is not derived from the plan — cut it or merge it into the task it actually belongs to.
- Every file in the ARD's "Structure" tree and every item under "Other" is delivered by exactly one task.
- Every DTO/payload in the ARD's "Data Contracts" section is produced or consumed by at least one task. If one isn't, add it to the task that should own it.
- No two tasks name the same file or interface as their primary deliverable, unless one explicitly modifies what the other created.

- No task whose target files already exist on the default branch is left marked `todo`. Update its status to `done` (or drop it) and tell the user — don't write it up as unimplemented work.

Fix any gaps you find yourself before moving to step 4. Only mention this check to the user if it surfaced a gap you could not resolve on your own.

### 4. Quiz the user on the breakdown

Present the proposed task list as a numbered list. Every task line — no exceptions, no omitting
it because it "looked obvious" — ends with its tier in bold, right after the title, so the user
never has to ask which model a task is headed for:

```
1. **Title of the task** — `tier/orientation`
   What it covers: which layers/files/concepts.
   Depends on: which earlier tasks must complete first, or none.
```

Use `draft-only` in place of `tier/orientation` where that applies, and omit the tier entirely
only for the CI-gate task. If you catch yourself about to present a task without its tier
rendered inline, stop and add it before showing the list — do not describe the tier in prose
elsewhere instead of on the line.

Ask the user:

- Does the granularity feel right?
- Are the dependency relationships correct?
- Should any tasks be merged or split?
- Does each suggested tier look right, or should any be bumped up/down — and does the split
  make good use of cheaper models, or is boilerplate still bundled into a higher-tier task?
- Does the overall mix skew toward cheap tiers, with `versatile`/`powerful` tasks as the minority?

Iterate until the user approves the breakdown.

### 5. Write the task files

Write every task file directly in this session — no subagent dispatch. Read [`references/task-writing.md`](references/task-writing.md) once and follow its contract exactly (template, no-placeholder rules, instruction-file matching) for each approved task, writing to `.plans/{name}/tasks/{nnn}-{task-slug}.md` (zero-padded three-digit index, e.g. `001-create-upsert-student-command.md`). You already hold `prd.md`, `ard.md`, and `context.md` in context from steps 1–2 — don't re-read them per task.

The model for this whole skill run is whatever the user set for the session — pick it (or ask the user to) based on the plan's overall difficulty before starting step 5, rather than routing per task.

After writing all task files, verify each exists at the expected path and skim it against the cross-consistency findings from step 3a — a task written from a narrow brief can still duplicate another task's ownership or miss an ARD data contract. Fix any gap directly.

The final **"Ensure CI passes"** task is static boilerplate with no ARD-specific judgment calls — write it directly from the template below:

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

All other tasks use the `<task-template>` in [`references/task-writing.md`](references/task-writing.md), written directly in this session.

### 6. Write the tasks index

Create or overwrite `.plans/{name}/tasks.md`:

<tasks-index-template>
# Tasks: {Feature Name}

| #   | Task                                              | Status | Depends on | Tier                 |
| --- | ------------------------------------------------- | ------ | ---------- | -------------------- |
| 1   | [Task title](tasks/001-task-name.md)              | todo   | —          | lightweight/generator |
| 2   | [Task title](tasks/002-task-name.md)              | todo   | 1          | versatile/generalist  |
| 3   | [Task title](tasks/003-task-name.md)              | todo   | 1, 2       | draft-only      |
| 4   | [Ensure CI passes](tasks/004-ensure-ci-passes.md) | todo   | all        | —                    |

## Progress

_0 / {total} tasks complete_
</tasks-index-template>

### 7. Wrap up

Tell the user:

- How many tasks were created
- The dependency order and any parallelism opportunities
- Next step: run `/my-implement-task {name}` to work through tasks one at a time, or `/my-implement-tasks {name}` to run the full loop unattended

## Output format

- A proposed numbered task breakdown for approval, with each task's title, scope, dependencies, and suggested tier
- Generated `.plans/{name}/tasks/{nnn}-{task-slug}.md` files using the templates above
- Generated or updated `.plans/{name}/tasks.md`, including each task's tier column
- A final wrap-up that states task count, dependency order, parallelism opportunities, and the next step (`/my-implement-task {name}` or `/my-implement-tasks {name}`)

## Anti-patterns to avoid

- Do not use this skill before `/my-review-plan` unless the user explicitly accepts grooming an ARD still marked `draft` by replying with the literal word `proceed`.
- Do not create horizontal slices; derive thin vertical tracer-bullet tasks instead.
- Do not remove, merge away, or skip the final **"Ensure CI passes"** task.
- Do not dispatch a subagent to write any task file — write every task directly in this session, including the CI-gate task.
- Do not assign the CI-gate task a tier — it's mechanical, not judgment-heavy.
- Do not use `draft-only` liberally — most tasks are executable; reserve it for tasks that are inherently about debate or ambiguity resolution, not ones that are merely hard or high-stakes (those get `powerful`, not `draft-only`).
- Do not bump weight up just because a task touches multiple files or looks like "a real feature" — if the task file already gives the exact contract verbatim, that's still `lightweight`, not a reason alone to escalate.
- Do not add a tier field to individual task files — `tasks.md`'s Tier column is the single source of truth; it's only read on the subagent-dispatch path anyway.
- Do not restate boilerplate already covered by matching instruction files.
- Do not write placeholders, vague acceptance criteria, guessed names, or hand-wavy references to other tasks in place of concrete paths and signatures.
- Do not write a task as `todo` when its target files already exist on the default branch — check first, mark `done` or drop it instead.
- Do not write a deviation note without verifying it against the instruction file it deviates from — a wrong note is worse than none.
- Do not restructure `## What` into per-file headers or tables for human scannability — the implementing agent, not a human, is the primary reader, and the flat format is the one proven correct at lowest cost.
- Do not write a vague acceptance criterion like "tests pass" or "formatting is correct" when the stack's exact check command is knowable — name it literally.
- Do not name a bare, unscoped test-runner command (`vitest run`, `phpunit`, `go test ./...`) as an acceptance criterion — it reads as license to run the full suite. Scope it to the exact test file(s)/filter this task's tests cover, e.g. `vitest run src/students/upsert.test.ts`.
- Do not copy a project's whole-project coverage/type-coverage CI command (e.g. `pest --coverage --min=100`) verbatim into a task's acceptance criteria just because it's the literal command named in the project's CI docs — a `--min` threshold evaluates against the whole codebase regardless of any path argument, so it's not actually scoped. Drop the threshold flags for per-task criteria and defer that check to the CI-gate task.
- Do not name a formatter's check-only flag (`pint --test`, `prettier --check`, `black --check`) as a per-task acceptance criterion — that mode is reserved for the CI-gate task. A per-task criterion should name the auto-fix mode (`pint`, `prettier --write`, `black`), unscoped against the whole project — not scoped to this task's files, same reasoning as the static-analysis check above.
- Do not scope a per-task phpstan/psalm/type-checker criterion to this task's path(s) (e.g. `phpstan analyse src/Students`) — name the bare, project-wide command instead. A path-scoped run can spuriously disagree with a project-wide baseline/ignore-list, and the tool's own result cache makes a full run cheap after the first one.
- Do not present a task in the step-4 quiz without its tier rendered inline on the task line — a tier mentioned only in this skill's own notes, or omitted because it "looked obvious," leaves the user unable to see which model each task is headed for.
- Do not bundle fully-specified boilerplate (a DTO, a resource class, generated types) into a `versatile`/`powerful` task just because it sits on the same vertical slice — split it out as its own `lightweight` task when it's independently testable/reviewable.
- Do not let `versatile`/`powerful` tasks become the majority of the list — actively hunt for granular, cheap-tier slices before settling for a coarse breakdown.

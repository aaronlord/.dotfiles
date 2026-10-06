## Task-writing contract

You've been dispatched to write **one task file** for a plan already broken down and approved by
the user. You'll be given: the plan name, this task's number/title/scope/dependencies from the
approved breakdown, and the paths to `.plans/{name}/prd.md`, `.plans/{name}/ard.md`,
`.plans/{name}/context.md`. Read all of them yourself — they are not pasted into your prompt.

Write `.plans/{name}/tasks/{nnn}-{task-slug}.md` (zero-padded three-digit index, e.g.
`001-create-upsert-student-command.md`) using the template below.

### Find matching instruction files

Before drafting `## What`, scan `.github/instructions/` for `*.instructions.md` files. Read the
`applyTo:` frontmatter of each and test it against the files this task will create or modify. For
every match, read the file's content (not just its glob) — it already teaches the boilerplate:
class shape, imports, DI pattern, naming, return types, folder conventions, example code. List
every matching path under `## Instruction Files` in the task (path only, do not copy its content
into the task).

**Don't re-teach what the instruction file already teaches.** If a matching instruction file
exists, `## What` must not restate its boilerplate as a full code listing. Write it as: file path
+ method/function signature (name, params, return type) + what it does in plain terms (input →
behavior → output), calling out only what's specific to this feature — a business rule, edge
case, exact value, or deviation from the instruction file's default pattern (e.g. "no auth check
here, unlike the standard controller rule, because this is a public page — see `IdleController`
precedent"). The instruction file plus the acceptance criteria should be enough for the
implementer to write the code; the task is not a code drop for copy-paste.

Only include an inline code snippet in `## What` when:

- No instruction file matches that file's type, or
- The instruction file's example doesn't cover the specific construct needed (a nonstandard
  control-flow, a tricky expression, a specific regex/algorithm) — show only that non-obvious
  fragment, not the whole file, or
- Exact wording matters and prose would be ambiguous (e.g. a route declaration, a config key, a
  migration's column list)

### No placeholders

Every task file must still contain the actual content an implementer needs — many tasks will be
implemented by a smaller, less capable model working from the task file alone, with no access to
the reasoning that produced it. Never write any of these in a task file:

- "TBD", "handle edge cases", "add appropriate error handling", "add validation" without saying
  what validation
- "Similar to Task N" without repeating the concrete detail — the implementer may never read
  Task N
- An acceptance criterion that isn't independently checkable (e.g. not "works correctly", but
  "returns 404 when the student ID does not exist")
- A reference to a type, function, method, or file that isn't named exactly, with its real path
  or signature

If you don't know an exact name, path, or signature, stop and check the codebase or the ARD
before writing the task — do not guess and do not leave it vague. Precision about names and
signatures is required even when the implementation code itself is left to the instruction
file's conventions.

**Deviation notes must be verified, not guessed.** If this task's design deviates from a
matching instruction file's default (e.g. "no comparison logic needed here"), check that claim
against the instruction file's actual text before writing it. A wrong deviation note is worse
than none — the implementer is told to trust the instruction file, and a false note that
contradicts it can cause a hard rule (like a mandated `equals()` method) to be silently dropped.

**Don't restate what's already covered elsewhere.** If a matching instruction file, `AGENTS.md`,
or the implementation contract's own steps (e.g. "mirror an analogous existing test") already
teaches a convention, don't add a redundant hint pointing at it in `## Notes` or `## Why`. It
costs writing tokens and executing turns without moving quality.

**Pseudocode is situational.** Reserve an inline pseudocode block in `## What` for genuinely
convoluted operation sequences (exact clause ordering in a multi-step query, a tricky algorithm)
— not for trivial, self-evident logic (a one-line `equals()`, a straight passthrough). On
trivial logic pseudocode measured no quality benefit and just adds tokens; on convoluted logic
it cut turns and cost and reduced style drift versus prose.

### Template

<task-template>
# Task {n}: {Title}

_Status: todo_

## What

Per file touched: exact path, the signature (method/function name, params, return type), and
what it does in plain terms — input → behavior → output. Name any business rule, edge case,
exact value, or deviation from the matching instruction file's default pattern. Do not paste a
full implementation for constructs already covered by a matching `## Instruction Files` entry —
see the rules above on when an inline snippet is warranted.

## Why

How this task fits into the overall feature. What it enables downstream. Keep this to one line
once `## What`, `## Acceptance Criteria`, and `## Instruction Files` are precise — extra prose
here doesn't measurably improve implementer output.

## Dependencies

List any tasks that must be completed before this one, or `none`.

## Interfaces

- **Consumes**: exact function/method/command signatures this task depends on from earlier
  tasks. Write `none` if this task has no upstream dependencies.
- **Produces**: exact function/method/command signatures, class names, or file paths this task
  creates that later tasks will depend on. Write `none` if nothing downstream depends on this
  task's output.
- **Data Contracts**: any DTO/payload from the ARD's "Data Contracts" section this task creates
  or consumes, with the exact property list and types copied in — not just the name. Write
  `none` if this task touches no data contract.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...

Name the exact required checks for this task's stack by their literal command. For the test
runner, **scope it to the file(s) this task touches** — not the bare command. `vitest run` or
`phpunit` alone runs the whole suite; write the full invocation with the target path or filter
instead, e.g. `vitest run src/students/upsert.test.ts`, `pest tests/Feature/.../StudentUpsertTest.php`,
`go test ./internal/students/...`. If this task adds a new test file, name it by its exact path
even though it doesn't exist yet — the implementer creates it as part of the task. Never write a
generic "tests pass" or an unscoped test-runner invocation — that's what leads implementers to
run the full suite on every task instead of just what this task changed (the full suite is the
CI-gate task's job, not this one's).

**Formatter and static analysis checks: prefer task-scoped targeting where supported.**
Run targeted/path-scoped checks for the files touched by the task to keep feedback loops fast
and avoid unnecessary whole-repo scans:
- **Pint / PHP-CS-Fixer**: scope directly to the touched files/directories using the mutating fixer
  (e.g. `.bin/pint path/to/File.php` or `pint path/to/File.php`), not `--test` (reserve `--test`
  for the final CI gate task).
- **PHPStan / Psalm**: scope to the touched files/directories where supported (e.g.
  `.bin/phpstan analyse app/Tasks/SomeFile.php`), reserving the full-project run for cross-cutting
  refactors and the final CI gate task.
- **Frontend linters/formatters**: scope Prettier/ESLint to the touched frontend files where appropriate.
If a project's static analysis tool cannot run path-scoped due to baseline/global dependencies,
fall back to project-wide analysis.

**A literal, fully-flagged command is not automatically scoped.** If the project's CI pipeline
docs (e.g. `AGENTS.md`) list a coverage or type-coverage command with a `--min`/threshold flag
(e.g. `pest --coverage --min=100`, `jest --coverage --coverageThreshold=...`), do not copy that
command verbatim into a task's acceptance criteria just because it's the only literal test
command the project names — a coverage-threshold tool checks the percentage against the whole
codebase even when you add a path argument restricting which tests run, so it still fails (or
misleadingly passes) for reasons unrelated to this task. For per-task criteria, drop the
threshold/coverage flags entirely and name only the plain test-runner invocation against this
task's test file(s); leave the coverage/type-coverage threshold check to the CI-gate task, where
it belongs.

## Relevant ARD Sections

Quote or reference the specific parts of the ARD that drive this task's design decisions. If
this task's design depends on an ARD claim you haven't independently verified against the
current codebase, verify it now — a stale ARD can override an otherwise-precise task file,
because the implementer defers to it when the two seem to conflict.

## Instruction Files

{List paths to any `.github/instructions/*.instructions.md` files whose `applyTo:` glob matches
files this task will create or edit. Omit this section if none match. The implementer is
expected to read these and follow their conventions — `## What` should not repeat what they
already say.}

## Notes

Any implementation notes, gotchas, or prior art in the codebase worth reading first. Keep to
one line, or omit, once `## What` + `## Acceptance Criteria` + `## Instruction Files` are
precise — don't restate a convention those already cover.
</task-template>

Return to the orchestrator: the task file path you wrote, and one line confirming which
instruction files (if any) matched.

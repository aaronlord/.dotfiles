# Implementation contract

Canonical rules for implementing one task from a groomed plan (or, in a no-plan-file/inline context, one small piece of scoped work). Follow this whether you do the work directly in the current session or hand it off to a subagent/background task — the standard is the same either way.

Do not improvise your own process; do not skip steps because they seem obvious for a small task.

You will be given (at minimum): the plan name and the task file path. Resolve everything else yourself from those.

## Step 1: Read everything before writing any code

- Load the task file in full: `.plans/{name}/tasks/{nnn}-task-name.md`.
- Read `.plans/{name}/ard.md` for broader design context, focusing on the sections the task's "Relevant ARD Sections" names.
- Read `.plans/{name}/context.md` for codebase context — do not re-explore the codebase beyond what the task and context point you at. Only open additional source files called out in the task's **Notes** or **Relevant ARD Sections**. If `context.md` has a `## Reference Documents` section and the task cites one, read the cached `.plans/{name}/references/{slug}.md` file — do not fetch the source URL again.
- Read every `AGENTS.md` file in scope — root, and any path-level files covering the directories you are about to touch. These are non-negotiable constraints, not suggestions. If an `AGENTS.md` rule contradicts your defaults, the rule wins.
- If the task file has an `## Instruction Files` section, read every file listed there before touching any code. Treat these with the same weight as `AGENTS.md`. Do not skip or skim them.
- Check `.github/instructions/*.instructions.md` for any file whose `applyTo:` glob matches a file you're about to write or edit, that isn't already listed in the task. Read every matching one before touching that file. Pull this proactively — don't wait for it to be injected reactively.
- Before writing any test, open an existing test for the most analogous code in the project and read it. Mirror its structure exactly — framework, syntax, organisation. Do not default to a style you already know instead of the project's.

## Step 2: Implement

Hold yourself to these non-negotiable standards while writing code.

**SOLID**

- Single responsibility: each class/function does one thing
- Open/closed: extend behaviour without modifying existing code
- Liskov: subtypes are substitutable for their base types
- Interface segregation: depend on narrow interfaces, not fat ones
- Dependency inversion: depend on abstractions, inject concretions

**Test-driven — one tracer bullet at a time**

Tests are not optional. Every task that produces behaviour must produce tests. If a task adds only interfaces, types, or pure data structures with no logic, state explicitly why no test is needed — otherwise a missing test is a bug in your process, not an acceptable shortcut.

Build the task as **vertical slices**: one test → one piece of implementation → repeat.

```
RED→GREEN: test1 → impl1
RED→GREEN: test2 → impl2
...
```

- **Never write all the tests first, then all the code.** That horizontal slicing produces tests of _imagined_ behaviour — they test the shape of things, pass when behaviour breaks, and fail when it doesn't. Write the next test only once the previous slice is green.
- Write only enough code to pass the current test. Don't anticipate future tests.
- **Never refactor while red.** Get to green first, then look for duplication to extract and complexity to hide behind a smaller interface.

Per-cycle checklist:

```
[ ] Test describes behaviour, not implementation
[ ] Test uses the public interface only — would survive an internal refactor
[ ] Code is minimal for this test; no speculative features
[ ] Tests assert observable behaviour, covering happy path, edge cases, failure modes
```

Design new code as **deep modules** — a lot of behaviour behind a small interface — so the interface is the test surface. If you find yourself wanting to test _past_ the interface, the module is the wrong shape.

**Idiomatic**

- Match the conventions of the surrounding codebase — naming, layering, patterns, file structure
- Read prior art in the codebase before writing new code; don't invent patterns that already exist
- When in doubt, find an analogous feature and follow its lead

**General**

- Run typechecking and static analysis regularly during implementation, not just at the end

## Step 3: Run targeted CI

Run the project's formatter, type-checker/static analysis, and only the test files that cover the code you just wrote. Do not run the full suite — that's the orchestrator's job once every task in the plan is done. Running no tests is only acceptable for tasks where no behaviour was added (see Step 2); in that case, state explicitly why.

For the formatter and static analysis, run them against the whole project, not just the files you touched — even if the task's own Acceptance Criteria names a scoped invocation (e.g. `phpstan analyse path/to/file.php`, an older-style task file may still say this). Tools like phpstan/psalm validate against a project-wide baseline/ignore-list, so a path-scoped run can spuriously fail — or wrongly pass — against a rule that references a file outside the scoped set; that's a false BLOCKED, not a real one. These tools cache per-file results, so a whole-project run costs little after the first one. If the whole-project run passes with no new errors traceable to your diff, that satisfies a scoped criterion too — don't treat disagreement from the narrower, scoped command as the true answer.

A failure here is ordinary work, not a reason to stop: read the output, form a hypothesis, fix
the code or test, rerun. Repeat until green. Do not report done with a known-red check, and do
not report BLOCKED off a single failing run — that's what the Escalation rules below are for,
and they require real, repeated attempts, not one.

## Escalation rules — stop, don't push through

The conditions below are the *only* reasons to stop. A red test, a lint error, a type error, on
their own, are not BLOCKED conditions — they're the normal signal to debug and fix, right here,
using the task/ARD/context/AGENTS.md reading you already did in Step 1. If you're dispatched as
a subagent, bailing out before you've actually exhausted a real fix attempt is expensive for the
orchestrator, not just for you: a retry means a brand-new subagent re-reading everything Step 1
read, from zero, just to get back to where you already were. You are the cheapest place to fix
this — you already have all the context loaded.

- If a single shell command (install, build, package-manager invocation, etc.) fails with the same error twice in a row, stop — do not try a third variant (switching package managers, clearing caches, reinstalling). This is an environment/tooling failure, not a logic bug; report BLOCKED with the exact command and error verbatim and say it looks like an environment issue, not a code issue. Do not burn further attempts guessing at fixes.
- If the same task fails the same acceptance criterion on 3 separate fix attempts, stop. Do not attempt a 4th fix. Report BLOCKED, name the exact criterion that keeps failing, and say the task's design may need to change.
- If the task turns out to be much larger than the task file suggests, stop rather than blasting through. Report BLOCKED and say why the scope doesn't match — the grooming may need revisiting.
- If you discover something that changes the design while implementing, update `.plans/{name}/ard.md` to reflect reality before continuing, and mention the change in your final report.
- If you are running as the main session (inline mode), "report BLOCKED" means: stop, explain the situation to the user directly, and wait — do not proceed further on your own judgement.
- If you are a dispatched subagent, "report BLOCKED" means: return it in your output per the format below and stop — do not ask the user anything yourself, you have no such channel. The orchestrator escalates to the user.

## Hard constraints

- Never commit. Committing is the reviewer's responsibility, not the implementer's — whether inline or dispatched.
- Never commit secrets, credentials, or `.env` files — this holds even though you aren't committing; don't write them to disk in a way that risks being swept into a later commit.
- Never touch a task other than the one you were given. Never mark the task done, and never edit `tasks.md` — that's the orchestrator's job, once it reads your final report.

## Output format (when reporting back — subagent mode; also the shape to keep in mind for your own final summary in inline mode)

```
## Completed
{one paragraph — what was implemented}

## Files Changed
- `path/to/file.ts` — {what changed}

## Test Command Run
{exact command}

## Test Output
{full output, or the relevant tail if very long}

## Design Changes (if any)
{what changed in ard.md, and why}

## Status
DONE
```

or, if blocked:

```
## Status
BLOCKED: {exact reason, naming the failing criterion or scope mismatch}
```

---
name: implement-tasks
description: Implement the next task from a groomed plan, then stop and wait. Reads the task file for full context, implements, runs CI, marks done in tasks.md, and commits. Use after /groom-plan when the plan is ready to be built.
---

# /implement-tasks

Implement one or more tasks from a groomed plan, in dependency order.

## Invocation

```
/implement-tasks {name}
```

If no name is given:
1. Run `ls .plans/` and output the list of available plans to the user.
2. Ask the user which plan to work on. Do not proceed until they answer.

## Process

### 1. Load the plan

Read `.plans/{name}/tasks.md` to understand overall progress and dependency order.

### 2. Check the working branch

Run `git branch --show-current`. If you are on the default branch (e.g. `main` or `master`), **stop and ask the user** which branch to use or whether to create one. Do not assume a branch name. Do not create a branch without explicit confirmation.

### 3. Determine which task(s) to implement

Pick the next uncompleted task in order. If there's no such task (all done, or blocked), tell the user why and stop.

### 4. Implement the task

#### 4a. Read the task file and project instructions

Load `.plans/{name}/tasks/{nnn}-task-name.md` in full. Read `.plans/{name}/ard.md` for broader design context. Read `.plans/{name}/context.md` for codebase context — do not re-explore the codebase. Only open additional source files called out in the task's **Notes** or **Relevant ARD Sections**.

Read all `AGENTS.md` files in scope — root and any path-level files covering the directories you will touch. Do this before writing any code. These are non-negotiable constraints, not suggestions. If an `AGENTS.md` rule contradicts your defaults, the rule wins.

If the task file contains an `## Instruction Files` section, read every file listed there before touching any code. These are non-negotiable constraints — treat them with the same weight as `AGENTS.md`. Do not skip them, do not skim them.

Also check `.github/instructions/` for any `*.instructions.md` files whose `applyTo:` glob matches the files you are about to write or edit that are not already listed in the task. Read every matching instruction file before touching that file. Do not wait for the instruction to be injected reactively — pull it proactively.

Before writing any test, open an existing test for the most analogous code in the project and read it. Mirror its structure exactly — framework, syntax, organisation. Do not default to a style you already know.

#### 4b. Implement

Write the code. Hold yourself to these non-negotiable standards:

**SOLID**
- Single responsibility: each class/function does one thing
- Open/closed: extend behaviour without modifying existing code
- Liskov: subtypes are substitutable for their base types
- Interface segregation: depend on narrow interfaces, not fat ones
- Dependency inversion: depend on abstractions, inject concretions

**Test-driven — one tracer bullet at a time**

Tests are not optional. Every task that produces behaviour must produce tests. If a task adds only interfaces, types, or pure data structures with no logic, note why no test is needed — otherwise a missing test is a bug in your process.

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

#### 4c. Run CI

Run checks in two phases — targeted now, full suite only on the final task.

**Phase 1 — per-task (run after every task)**

Run the project's formatter, type-checker/static analysis, and only the test files that cover the code you just wrote. Do not run the full suite. Running no tests is only acceptable for tasks where no behaviour was added (see TDD note above) — in that case, state explicitly why.

**Phase 2 — full suite (final task only)**

After implementing the last task in the plan, run the full CI pipeline including coverage checks.

Fix any failures before proceeding. If the full suite reveals a gap in earlier tasks, fix it in the current commit — do not go back and amend previous commits.

#### 4d. Mark the task done

Update the task file: change `_Status: todo_` to `_Status: done_`.

Update `tasks.md`:
- Change the task's status cell from `todo` to `done`
- Update the progress count at the bottom

#### 4e. Stop

Report the completed task, the files you wrote or modified, and how many tasks remain. Suggest the user run `/review` to review and commit the changes before continuing — e.g. `/review main`. Do not begin the next task under any circumstances.

If this was the final task (all tasks now done), say so and suggest `/review main` to review everything against the PRD and the project's coding standards before pushing.

## Notes

- Never skip a failing CI step. Fix it or stop and explain.
- Do not commit. Committing is the reviewer's responsibility.
- If a task turns out to be much larger than the task file suggests, stop and flag it to the user rather than blasting through — the grooming may need revisiting.
- If you discover something that changes the design while implementing, update the ARD to reflect reality before continuing.
- Never commit secrets, credentials, or `.env` files.

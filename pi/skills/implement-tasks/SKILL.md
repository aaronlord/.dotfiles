---
name: implement-tasks
description: Implement the next task from a groomed plan, then stop and wait. Reads the task file for full context, implements, runs CI, marks done in tasks.md, and commits. Use after /groom-plan when the plan is ready to be built.
disable-model-invocation: true
---

# /implement-tasks

Implement one or more tasks from a groomed plan, in dependency order.

## Invocation

```
/implement-tasks {name}
```

If no name is given, list the available plans and ask which one.

## Process

### 1. Load the plan

Read `.plans/{name}/tasks.md` to understand overall progress and dependency order.

### 2. Determine which task(s) to implement

Pick the next uncompleted task in order. If there's no such task (all done, or blocked), tell the user why and stop.

### 3. Implement the task

#### 3a. Read the task file

Load `.plans/{name}/tasks/{nnn}-task-name.md` in full. Read `.plans/{name}/ard.md` for broader design context. Read `.plans/{name}/context.md` for codebase context — do not re-explore the codebase. Only open additional source files called out in the task's **Notes** or **Relevant ARD Sections**.

#### 3b. Implement

Write the code. Hold yourself to these non-negotiable standards:

**SOLID**
- Single responsibility: each class/function does one thing
- Open/closed: extend behaviour without modifying existing code
- Liskov: subtypes are substitutable for their base types
- Interface segregation: depend on narrow interfaces, not fat ones
- Dependency inversion: depend on abstractions, inject concretions

**Test-driven — one tracer bullet at a time**

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
- Read `context.md` and prior art in the codebase before writing new code; don't invent patterns that already exist
- When in doubt, find an analogous feature and follow its lead

**General**
- Run typechecking and static analysis regularly during implementation, not just at the end
- Always follow any AGENTS.md or path-level instruction files in scope for the project

#### 3c. Run CI

Run the full CI pipeline for the language(s) touched:

**Backend (PHP):**
```bash
./vendor/bin/pint           # format
./vendor/bin/phpstan analyse --memory-limit=1G
./vendor/bin/pest --ci --parallel --compact --coverage --min=100 --exclude-testsuite Browser
```

**Frontend (JS/TS):**
```bash
pnpm run format
pnpm run types:check
pnpm run lint:check
pnpm run test:run
```

If the project has a `.bin/magnus` wrapper, use that instead.

Fix any failures before proceeding.

#### 3d. Mark the task done

Update the task file: change `_Status: todo_` to `_Status: done_`.

Update `tasks.md`:
- Change the task's status cell from `todo` to `done`
- Update the progress count at the bottom

#### 3e. Commit

```bash
git add -A
git commit -m "{type}: {imperative description of what was implemented}"
```

Use conventional commit types: `feat`, `fix`, `refactor`, `test`, `chore`. The message should describe what was built, not reference the task number.

#### 3f. Stop

Always stop here. Report the completed task, how many tasks remain, and wait for the user to invoke again. Do not begin the next task under any circumstances.

If this was the final task (all tasks now done), tell the user the feature is fully implemented and suggest running `/review` before pushing — e.g. `/review main` to review everything against the PRD and the project's coding standards.

## Notes

- Never skip a failing CI step. Fix it or stop and explain.
- If a task turns out to be much larger than the task file suggests, stop and flag it to the user rather than blasting through — the grooming may need revisiting.
- If you discover something that changes the design while implementing, update the ARD to reflect reality before continuing.
- Never commit secrets, credentials, or `.env` files.

---
name: implement-tasks
description: Implement tasks from a groomed plan one at a time (or all at once with --all). Reads each task file for full context, implements, runs CI, marks done in tasks.md, and commits. Use after /groom-plan when the plan is ready to be built.
disable-model-invocation: true
---

# /implement-tasks

Implement one or more tasks from a groomed plan, in dependency order.

## Invocation

```
/implement-tasks {name}          ← next uncompleted task only
/implement-tasks {name} --all    ← all uncompleted tasks in sequence
/implement-tasks {name} {n}      ← specific task number
```

If no name is given, list the available plans and ask which one.

## Process

### 1. Load the plan

Read `.plans/{name}/tasks.md` to understand overall progress and dependency order.

### 2. Determine which task(s) to implement

**Default (no flag):** Pick the next uncompleted task whose dependencies are all complete. If there's no such task (all done, or blocked), tell the user why and stop.

**`--all`:** Build the full list of implementable tasks in dependency order. Proceed through them sequentially — complete one fully (implement + CI + commit) before starting the next.

**Specific number (`{n}`):** Implement that task. If its dependencies aren't complete, warn the user and ask for confirmation before proceeding.

### 3. For each task

#### 3a. Read the task file

Load `.plans/{name}/tasks/{nnn}-task-name.md` in full. Also read the ARD (`.plans/{name}/ard.md`) for broader design context. Read any relevant files in the codebase called out in the task's **Notes** or **Relevant ARD Sections**.

#### 3b. Implement

Write the code. Follow the project's conventions (DDD/Hexagonal/CQRS/layering) as described in the ARD and any AGENTS.md files in scope.

- Use TDD where natural seams exist
- Run typechecking and static analysis regularly during implementation, not just at the end
- Run the relevant test file(s) after each logical unit of change

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

### 4. After the last task (or after `--all` completes)

Report:
- Which tasks were completed
- Any tasks that remain and why (blocked, skipped, failed)
- Whether the full test suite is green
- Suggest next steps (open a PR, run `/review-plan` on the next plan, etc.)

## Notes

- Never skip a failing CI step. Fix it or stop and explain.
- If a task turns out to be much larger than the task file suggests, stop and flag it to the user rather than blasting through — the grooming may need revisiting.
- If you discover something that changes the design while implementing, update the ARD to reflect reality before continuing.
- Never commit secrets, credentials, or `.env` files.

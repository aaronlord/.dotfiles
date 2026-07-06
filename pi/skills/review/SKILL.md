---
name: review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along five axes — Standards, Spec, Security, Performance, and Docs. Runs all five reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, WIP changes, or asks to "review since X".
---

Four-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating PRD / issue / spec?
- **Security** — does the diff introduce vulnerabilities, insecure patterns, or attack surface?
- **Performance** — does the diff introduce regressions, inefficiencies, or scalability concerns?
- **Docs** — does the diff introduce a new pattern, convention, or decision not reflected in any doc?

All five axes run as **parallel, dedicated specialist sub-agents** (`standards-reviewer`, `spec-reviewer`, `security-reviewer`, `performance-reviewer`, `docs-reviewer`) so they don't pollute each other's context and each one enforces its own scope and output format by construction, not by per-call prompt text. This skill's job is to gather the dynamic inputs each specialist needs and aggregate what comes back.

## Process

### 1. Pin the fixed point

If the user didn't specify a fixed point, default to `main`. Use `git diff main...HEAD` (three-dot, so the comparison is against the merge-base).

If they did specify one — a commit SHA, branch name, tag, `HEAD~5`, etc. — use that instead.

Capture the diff command once and note the commit list via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here — not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. A `.plans/` directory whose name matches the branch or feature — use its `prd.md` as the spec.
2. Issue references in the commit messages (`#123`, `Closes #45`, etc.) — fetch via the project's issue tracker if accessible.
3. A path the user passed as an argument.
4. A PRD/spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
5. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Look for any files in the repo that document how code should be written:
- `AGENTS.md` (root and any path-level files in scope) — read them all
- `.github/instructions/*.instructions.md` — read every file; record both the `applyTo:` glob and the rule body. Then, for each changed file in the diff, determine which instruction files' globs match it. Build a mapping: **file path → applicable instruction files**. Pass this mapping to the Standards sub-agent so it knows which rules apply to which files.
- `CODING_STANDARDS.md`, `CONTRIBUTING.md`, or equivalent
- ADRs under `docs/` that establish conventions

Read each file found. Pass their contents (or relevant excerpts) to the Standards sub-agent so it can cite specific rules.

### 4. Spawn all five sub-agents in parallel

Send a single message with five `Agent` tool calls, each dispatched to its own dedicated specialist agent — not the generic `worker`. Each specialist already carries its own review method, tool scope, and output format; your job here is only to hand it the dynamic, per-repo data it needs. Keep each payload to data, not instructions — the instructions already live in the agent file.

**`standards-reviewer`** — pass:

- The full diff command and commit list.
- The standards-source files found in step 3, with full contents or relevant excerpts.
- The file-path → applicable instruction files mapping built in step 3.

**`spec-reviewer`** — pass:

- The diff command and commit list.
- The path or fetched contents of the spec.

If the spec is missing, skip this dispatch entirely — `spec-reviewer` reports its own "no spec available" output when asked with nothing to review, but prefer not to spawn it at all and note the omission in the final report.

**`security-reviewer`** — pass:

- The full diff command and commit list.

**`performance-reviewer`** — pass:

- The full diff command and commit list.

**`docs-reviewer`** — pass:

- The full diff command and commit list.
- The list of doc files found in step 3 (`AGENTS.md`, `CONTEXT.md`, `docs/decisions/`, `docs/**`), with contents or relevant excerpts.

### 5. Aggregate

Present the five reports under `## Standards`, `## Spec`, `## Security`, `## Performance`, and `## Docs` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the five axes are deliberately separate (see _Why five axes_).

End with a one-line summary: total findings per axis, and the worst issue within each axis (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

### 6. Commit

After presenting the review, ask the user whether to commit the changes.

If they confirm:

1. Run `git status` to identify what has changed in the working tree and staging area.
2. Stage **only the files that belong to this change** — do not use `git add -A` or `git add .`. Any files that were already dirty before the work started are not yours to commit.
3. Show the user the exact list of files you intend to stage and the proposed commit message. Wait for confirmation before running `git commit`.
4. Commit:

```bash
git add {only the relevant files}
git commit -m "{type}: {imperative description}"
```

Use conventional commit types: `feat`, `fix`, `refactor`, `test`, `chore`. The message describes what was built, not the review process.

If the review surfaced hard violations the user has not yet addressed, note them clearly before asking whether to commit — do not silently commit over them.

## Why five axes

A change can pass some axes and fail others:

- Code that follows every standard and matches the spec but introduces a SQL injection → **Standards pass, Spec pass, Security fail.**
- Code that is secure and idiomatic but implements the wrong thing → **Standards pass, Security pass, Spec fail.**
- Code that is correct and secure but hammers the database with N+1 queries → **Standards pass, Spec pass, Security pass, Performance fail.**
- Code that is correct, secure, and fast but introduces a new pattern with no doc update → **Standards pass, Spec pass, Security pass, Performance pass, Docs fail.**

Reporting them separately stops one axis from masking another.

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

All five axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

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

Send a single message with five `Agent` tool calls. Use the `worker` subagent for all five.

**Standards sub-agent prompt** — include:

- The full diff command and commit list.
- The list of standards-source files found in step 3, with their full contents or relevant excerpts.
- The file-path → applicable instruction files mapping built in step 3. Instruction files use `applyTo:` globs; only apply a given instruction file's rules to changed files whose paths match its glob. Do not apply an instruction file's rules to files whose paths do not match its glob.
- The brief: "Review each changed file against only the instruction files whose `applyTo:` glob matches that file's path. Report — per file/hunk — every place the diff violates a documented standard. Cite the standard (instruction file name + the rule). Distinguish hard violations from judgement calls. Skip anything tooling enforces automatically. **Explicitly check: does the diff introduce behaviour without corresponding test files? If so, report it as a hard violation — missing tests are not optional.** Under 400 words."

**Spec sub-agent prompt** — include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

**Security sub-agent prompt** — include:

- The full diff command and commit list.
- The brief: "Review the diff for security vulnerabilities and insecure patterns. Cover: injection (SQL, command, XSS), authentication/authorisation flaws, insecure data exposure (secrets, PII, over-broad API responses), unsafe deserialization, missing input validation, insecure dependencies introduced, and any other OWASP Top 10 concerns relevant to the diff. For each finding: state the vulnerability class, quote the relevant code, explain the risk, and suggest a fix. Distinguish confirmed vulnerabilities from theoretical risks. Under 400 words."

**Performance sub-agent prompt** — include:

- The full diff command and commit list.
- The brief: "Review the diff for performance regressions and inefficiencies. Look broadly for any code that is unnecessarily slow, wasteful, or unlikely to scale — don't limit yourself to a checklist. Common patterns to watch for include (but are not limited to): N+1 queries, missing indexes, unbounded loops or recursion, unnecessary computation in hot paths, missing caching where applicable, large payload sizes, blocking I/O, and memory leaks. For each finding: quote the relevant code, explain the performance impact, and suggest a fix. Distinguish confirmed regressions from theoretical concerns. Under 400 words."

Add the Docs sub-agent prompt after the Performance one:

**Docs sub-agent prompt** — include:

- The full diff command and commit list.
- The list of doc files found in step 3 (`AGENTS.md`, `CONTEXT.md`, `docs/decisions/`, `docs/**`).
- The brief: "Review the diff for documentation drift. Look for: new patterns or conventions introduced without a corresponding update to AGENTS.md; new domain terms used in code but absent from CONTEXT.md; architectural decisions made in the diff that aren't recorded in docs/decisions/; existing docs that now contradict what the code does. For each finding: quote the relevant code, name the doc that should be updated, and describe the missing or contradicting content in one sentence. Do NOT rewrite the docs — flag only. End each finding with: → run /update-docs to fix. Under 300 words."

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

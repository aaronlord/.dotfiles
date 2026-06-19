---
name: review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along four axes — Standards (does the code follow this repo's documented coding standards?), Spec (does the code match the originating PRD / issue / spec?), Security (does the diff introduce vulnerabilities or insecure patterns?), and Performance (does the diff introduce performance regressions or inefficiencies?). Runs all four reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, WIP changes, or asks to "review since X".
---

Three-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating PRD / issue / spec?
- **Security** — does the diff introduce vulnerabilities, insecure patterns, or attack surface?
- **Performance** — does the diff introduce regressions, inefficiencies, or scalability concerns?

All four axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

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
- `AGENTS.md` (root and any path-level files in scope)
- `CODING_STANDARDS.md`, `CONTRIBUTING.md`, or equivalent
- ADRs under `docs/` that establish conventions

### 4. Spawn all three sub-agents in parallel

Send a single message with three `Agent` tool calls. Use the `general-purpose` subagent for all three.

**Standards sub-agent prompt** — include:

- The full diff command and commit list.
- The list of standards-source files found in step 3.
- The brief: "Report — per file/hunk where relevant — every place the diff violates a documented standard. Cite the standard (file + the rule). Distinguish hard violations from judgement calls. Skip anything tooling enforces automatically. Under 400 words."

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

### 5. Aggregate

Present the four reports under `## Standards`, `## Spec`, `## Security`, and `## Performance` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the four axes are deliberately separate (see _Why four axes_).

End with a one-line summary: total findings per axis, and the worst issue within each axis (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why four axes

A change can pass some axes and fail others:

- Code that follows every standard and matches the spec but introduces a SQL injection → **Standards pass, Spec pass, Security fail.**
- Code that is secure and idiomatic but implements the wrong thing → **Standards pass, Security pass, Spec fail.**
- Code that is correct and secure but hammers the database with N+1 queries → **Standards pass, Spec pass, Security pass, Performance fail.**

Reporting them separately stops one axis from masking another.

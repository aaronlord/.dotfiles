---
name: my-review
description: >
  Review code changes since a fixed point across Standards, Spec, Security, Performance, and
  Docs. Use when the user says "review since main", "review this branch", or wants a diff/WIP
  code review. Do NOT use for PRD/ARD review (my-review-plan) or PR workflow steps (my-fix-pr,
  my-open-pr).
version: 1.4.0
---

Review the diff between `HEAD` and a fixed point the user supplies across five axes:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating PRD / issue / spec?
- **Security** — does the diff introduce vulnerabilities, insecure patterns, or attack surface?
- **Performance** — does the diff introduce regressions, inefficiencies, or scalability concerns?
- **Docs** — does the diff introduce a new pattern, convention, or decision not reflected in any doc?

All five axes run as **independent review passes**, each scoped to its own criteria so they don't
pollute each other's context and each one enforces its own scope and output format by
construction, not by per-call prompt text. This skill's job is to gather the dynamic inputs each
pass needs and aggregate what comes back.

**Security** always runs as two independent passes — one dispatched with `model-matrix.md`'s
`versatile/generator` model, one with its `versatile/generalist` model — because a second,
differently-oriented model catches real additional coverage on an axis this is the only check
for. **Standards** also runs doubled, for the same reason: `/my-implement-tasks` trusts each
task's own self-report and runs no separate per-task Standards check, so this pass is the only
independent Standards check the diff ever gets. Spec, Performance, and Docs stay single-pass.

## When to use

- The user wants a code review since a fixed point such as `main`, a branch, tag, commit, or merge-base.
- The user says things like "review since main", "review this branch", "review my WIP", or asks for a diff review.
- The user wants the review split into separate Standards, Spec, Security, Performance, and Docs findings instead of one blended pass.

## When NOT to use

- Do not use for reviewing a PRD/ARD or planning documents — use `my-review-plan`.
- Do not use for PR-lifecycle follow-up such as addressing review comments or opening a PR — use `my-fix-pr` or `my-open-pr`.
- Do not collapse this into one generic reviewer when the user asked for the five-axis diff review.

## Workflow

### 1. Pin the fixed point

If the user didn't specify a fixed point, default to `main`. Use `git diff main...HEAD` (three-dot,
so the comparison is against the merge-base).

If they did specify one — a commit SHA, branch name, tag, `HEAD~5`, etc. — use that instead.

Capture the diff command once and note the commit list via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the
diff is non-empty. A bad ref or empty diff should fail here — not inside a parallel review pass.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. A `.plans/` directory whose name matches the branch or feature — use its `prd.md` as the spec.
2. Issue references in the commit messages (`#123`, `Closes #45`, etc.) — fetch via the project's issue tracker if accessible.
3. A path the user passed as an argument.
4. A PRD/spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
5. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** pass will skip and report "no spec available".

### 3. Identify the standards sources

Look for any files in the repo that document how code should be written. Main only needs to know
*which* files exist and *which* apply to which changed file — the reviewing subagent reads the
rule bodies itself. Don't read full file contents here; that cost belongs to the subagent that
actually uses the rules, not to main building the map.

- `AGENTS.md` (root and any path-level files in scope) — record the paths only, do not read them.
- `.github/instructions/*.instructions.md` — read only the frontmatter (the `applyTo:` glob line,
  e.g. `head -5` or a frontmatter-only grep) of each file, not the rule body. Then, for each
  changed file in the diff, determine which instruction files' globs match it. Build a mapping:
  **file path → applicable instruction file paths**. Pass this mapping (paths, not bodies) to the
  Standards pass.
- `CODING_STANDARDS.md`, `CONTRIBUTING.md`, or equivalent — record the paths only.
- ADRs under `docs/` that establish conventions — record the paths only.

Pass the file paths (not contents) found here to the Standards and Docs passes; each subagent
reads the actual files itself once dispatched.

### 4. Run all five review passes

If you want the axes isolated from each other's context, dispatch each pass at once as isolated
subagents/background tasks (e.g. the generic `worker` agent via the `subagent` tool — one
dispatch per axis, except Standards and Security which get two dispatches each, seven dispatches
total — each given its reference file's contents as its task instructions) — not a single
generic reviewer covering all axes. Each reference file already carries its own review method,
tool scope, and output format; your job here is only to hand each pass the dynamic, per-repo data
it needs. Keep each payload to data, not instructions — the instructions already live in the
reference file. Keep that data to paths and short mappings, not file contents — output tokens
cost more than input tokens, so main writing full file bodies into a task string is more
expensive than letting the subagent's own `read` tool pull them in as input tokens. Otherwise, run
the passes sequentially yourself in the current session, one pass at a time, without letting
findings from one axis bleed into another's output.

**[`references/standards.md`](references/standards.md)** — dispatch **twice**, once with
`model-matrix.md`'s `versatile/generator` model/thinkingLevel and once with its
`versatile/generalist` model/thinkingLevel (both isolated subagents, same reference file, same
inputs). Pass each:

- The full diff command and commit list.
- The standards-source file **paths** found in step 3 (not contents) — the subagent reads them itself.
- The file-path → applicable instruction file **paths** mapping built in step 3 (paths, not rule bodies).

**[`references/spec.md`](references/spec.md)** — single pass:

- The diff command and commit list.
- The path or fetched contents of the spec.

If the spec is missing, skip this pass entirely — `references/spec.md`'s contract produces its own
"no spec available" output when asked with nothing to review, but prefer not to run it at all and
note the omission in the final report.

**[`references/security.md`](references/security.md)** — dispatch **twice**, same split as
Standards above (`versatile/generator` + `versatile/generalist`, both isolated subagents, same
inputs):

- The full diff command and commit list.

**[`references/performance.md`](references/performance.md)** — single pass:

- The full diff command and commit list.

**[`references/docs.md`](references/docs.md)** — single pass:

- The full diff command and commit list.
- The list of doc file **paths** found in step 3 (`AGENTS.md`, `CONTEXT.md`, `docs/adr/`, `docs/**`) — the subagent reads them itself, not contents or excerpts.

### 5. Reconcile the doubled passes

For **Standards** and **Security** only: you now have two reports per axis (generator-model pass,
generalist-model pass). Merge them into the single axis report the user sees — do not show two
full reports:

- A finding both passes caught: keep one copy.
- A finding only one pass caught: keep it in the merged list (don't drop it just because only one
  model found it), but tag it inline with which pass caught it, e.g. `(generalist-only)` or
  `(generator-only)`.

Do this merge yourself in the current session — it's a comparison over two already-produced
reports, not a task that needs its own subagent dispatch.

### 6. Aggregate

Present the five reports (Standards and Security already merged per step 5) under `## Standards`,
`## Spec`, `## Security`, `## Performance`, and `## Docs`
headings, verbatim or lightly cleaned. Do **not** merge or rerank findings **across** axes — the
five axes are deliberately separate; merging is only for the two passes *within* Standards/Security.

End with a one-line summary: total findings per axis, and the worst issue within each axis (if
any). Don't pick a single winner across axes — that's the reranking the separation exists to
prevent.

### 7. Apply fixes (optional)

If the user asks you to fix findings after seeing the report, don't edit the files yourself in
the main session — dispatch each fix to its own `worker` subagent, same pattern as the review
passes. The main agent is usually the priciest model in play; burning it on mechanical edits a
cheaper Generator model handles fine defeats the point of tiering models at all.

Flow: **classified fixes → lightweight CI pass → orchestrator validates.** Finding a bug (Security
pass, `powerful`-tier) and implementing its already-named fix are different jobs — don't let the
finding's severity set the fix's tier.

1. Ask the user which findings to fix if it isn't obvious (all of them, one axis, a specific
   finding) — don't assume "fix everything" from an ambiguous "fix it."
2. Group findings by file. Never dispatch two fixer subagents against the same file concurrently
   — conflicting edits. One dispatch per file (or per tightly-coupled file group), each given only
   that file's findings, the cited rule/spec text, and the relevant diff hunk — not the whole
   review report or whole diff.
3. Classify each group's fix using [`references/fix-classifier.md`](references/fix-classifier.md)
   — weight/orientation/thinking-level, plus its rule on sequencing instead of merging tiers when
   a high-tier and low-tier fix share a file, and on stopping to `ask_user` when a fix's approach
   is still genuinely ambiguous rather than guessing or hedging up to `powerful`.
4. Dispatch fixer subagents per their classified tier, in parallel across independent file groups
   (never within the same file/sequenced group concurrently). Each fixer makes the semantic edit
   only and stops — it does not own a full lint/typecheck/test loop; that's step 5. A quick
   self-check of the file it just touched is fine, but don't let the fixer iterate against the
   full suite itself, that's what burns tokens at its (possibly high) output rate.
5. **Lightweight/generator CI pass**: one dispatch (`lightweight/generator`, or main via `bash`
   directly if that's cheaper) runs the project's actual CI equivalent — formatter, static
   analysis, full test suite — once across every file the fixers touched.
   - Fix mechanical failures inline: missing type hint, unused import, a test's expected value
     needing to change to match behavior the finding already specified, formatting.
   - Stop and surface anything **not mechanical** — a static-analysis error that reveals the fix's
     approach doesn't actually hold up, or a test failure implicating unrelated behavior/an edge
     case the original finding never described. Resolving these means re-deciding what the fix
     should do, which this pass isn't positioned to judge safely. When genuinely in doubt whether
     something is mechanical, treat it as not mechanical — don't guess, don't auto-retry.
6. **Orchestrator validates**: review the CI pass's report together with the diff, confirm each
   fix actually matches the finding it was meant to address (not just "CI is green"), then show the
   user that diff before step 8's commit — this is the human-approval gate; don't let a fixer or
   the CI pass's edits go straight to commit unseen.

### 8. Commit

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

Use conventional commit types: `feat`, `fix`, `refactor`, `test`, `chore`. The message describes
what was built, not the review process.

If the review surfaced hard violations the user has not yet addressed, note them clearly before
asking whether to commit — do not silently commit over them.

## Examples

- Code that follows every standard and matches the spec but introduces a SQL injection → **Standards pass, Spec pass, Security fail.**
- Code that is secure and idiomatic but implements the wrong thing → **Standards pass, Security pass, Spec fail.**
- Code that is correct and secure but hammers the database with N+1 queries → **Standards pass, Spec pass, Security pass, Performance fail.**
- Code that is correct, secure, and fast but introduces a new pattern with no doc update → **Standards pass, Spec pass, Security pass, Performance pass, Docs fail.**

## Output format

- Present findings under `## Standards`, `## Spec`, `## Security`, `## Performance`, and `## Docs`.
- For Standards and Security, present one merged list per axis (not two reports) — tag any finding
  caught by only one of the two passes with `(generator-only)` or `(generalist-only)`.
- Keep each axis separate; verbatim or lightly cleaned is fine.
- End with a one-line summary giving total findings per axis and the worst issue within each axis, if any.

## Anti-patterns to avoid

- Do not run one generic blended review pass across all axes; each axis must stay isolated.
- Do not let findings from one axis bleed into another axis's output.
- Do not merge or rerank findings across axes; separation stops one axis from masking another.
- Do not defer bad refs or empty diffs into downstream review passes; fail them during fixed-point validation.
- Do not run the Spec pass when no spec exists; note the omission in the final report instead.
- Do not double up Spec, Performance, or Docs without a specific reason — they're single-pass-ever
  axes today, so doubling would be new cost with no re-check already happening upstream to weigh
  against.
- Do not present Standards/Security as two separate full reports — merge per step 5 and only
  surface the divergence, not the raw duplication.
- Do not implement suggested fixes yourself as the main agent — dispatch a sized subagent per
  file/finding via `references/fix-classifier.md`, same as the review passes themselves.
- Do not dispatch two fixer subagents against the same file concurrently — group by file first,
  and sequence rather than merge when a high-tier and low-tier fix share a file (see
  `references/fix-classifier.md`).
- Do not set a fix's tier from the finding's severity ("it's Security, so use the powerful tier")
  — classify the fix itself; a severe finding with an already-decided fix pattern is usually a
  cheap-tier fix.
- Do not let a fixer subagent own its own lint/typecheck/test loop — it makes the edit and stops;
  the lightweight CI pass (step 7.5) validates, not the fixer iterating against the suite itself.
- Do not auto-retry or escalate a non-mechanical CI-pass failure — stop and surface it; guessing
  at a re-fix is exactly the risk classifying tiers correctly was meant to avoid.
- Do not let fixer subagents' or the CI pass's edits reach `git commit` unseen — show the diff
  before step 8.

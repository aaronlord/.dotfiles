---
name: my-diagnose-bugs
description: >
  Diagnose hard bugs, performance regressions, and Sentry/Jira issues by building a red-capable
  feedback loop, testing ranked hypotheses, and closing with a regression test. Use when the
  user says "diagnose"/"debug this" or reports something broken, throwing, failing, or slow.
  Do NOT use for diff or branch audits; use my-review.
version: 1.0.0
---

# Diagnosing Bugs

A discipline for hard bugs. Skip phases only when explicitly justified.

When exploring the codebase, read `CONTEXT.md` (if it exists) to get a clear mental model of the relevant modules, and check ADRs in `docs/adr/` for the area you're touching.

## When to use

- The user says "diagnose", "debug this", "something is broken", "this is throwing", "tests are failing", or "this got slow".
- The problem is a hard bug, flaky bug, or performance regression that needs a reproducible loop before fixing.
- The trigger is a Sentry issue (link, ID, or "fix SENTRY-XXX") or a Jira ticket (link, key, or "fix TEAM-123").

## When NOT to use

- Do NOT use for diff or branch audits looking for latent issues; use `my-review`.
- Do NOT use for work that is primarily implementation, planning, or design review rather than diagnosing a concrete broken/throwing/failing/slow behavior.

## Workflow

### Phase 0 — External ticket sources (if the bug source is a tracked issue)

When the trigger is a linked issue rather than a raw description, identify **which** source and pull it in before starting Phase 1:

- Sentry link, ID, or "fix SENTRY-XXX" → read `resources/sentry.md` and follow it.
- Jira link, key (e.g. `TEAM-123`), or "fix TEAM-123" → read `resources/jira.md` and follow it.

Both resource files converge on the same shape: fetch the issue, note its short ID/key (needed for the regression test comment in Phase 5), pull repro ingredients (stack trace/description, breadcrumbs/comments, payload/attachments), and — once fixed — update the issue.

Everything below proceeds as normal — a tracked issue is just another way to arrive at the bug, still needs a red-capable loop and a regression test.

### Phase 1 — Build a feedback loop

**This is the skill.** Everything else is mechanical. If you have a **tight** pass/fail signal for the bug — one that goes **red** on _this_ bug — you will find the cause; bisection, hypothesis-testing, and instrumentation all just consume it. If you don't have one, no amount of staring at code will save you.

Spend disproportionate effort here. **Be aggressive. Be creative. Refuse to give up.**

#### Ways to construct one — try them in roughly this order

1. **Failing test** at whatever seam reaches the bug — a unit, feature, or integration test in the project's test suite (e.g. Pest/PHPUnit, Vitest/Jest).
2. **HTTP script** — `curl` against a running dev server.
3. **CLI invocation** with a fixture input, diffing output against a known-good snapshot. A throwaway REPL script or a one-off command counts.
4. **Headless browser script** (Playwright) — drives the UI, asserts on DOM/console/network. Use the `my-playwright-cli` skill.
5. **Replay a captured payload.** Save a real request / webhook body / event to disk; replay it through the code path in isolation.
6. **Throwaway harness.** Spin up a minimal subset of the system (one service, faked deps) that exercises the bug code path with a single call.
7. **Property / fuzz loop.** If the bug is "sometimes wrong output", run 1000 random inputs and look for the failure mode.
8. **Bisection harness.** If the bug appeared between two known states (commit, dataset, version), automate "boot at state X, check, repeat" so you can `git bisect run` it.
9. **Differential loop.** Run the same input through old-version vs new-version (or two configs) and diff outputs.
10. **HITL bash script.** Last resort. If a human must click, drive _them_ with a structured script so the loop stays structured. Captured output feeds back to you.

Build the right feedback loop, and the bug is 90% fixed.

#### Tighten the loop

Treat the loop as a product. Once you have _a_ loop, **tighten** it:

- Faster? (Cache setup, skip unrelated init, narrow to the one test.)
- Sharper signal? (Assert on the specific symptom, not "didn't throw".)
- More deterministic? (Pin time, seed the faker, isolate the DB, freeze the network.)

Use `multi_tool_use.parallel` for independent read-only probes or hypothesis checks when they do not share mutable state. Keep the single red-capable repro loop authoritative; serialize probes that touch the same database, server, port, cache, or output path. Do not launch duplicate suite runs while investigating one failure.

A 30-second flaky loop is barely better than no loop; a 2-second deterministic one is **tight** — a debugging superpower.

#### Non-deterministic bugs

The goal is not a clean repro but a **higher reproduction rate**. Loop the trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. A 50%-flake bug is debuggable; 1% is not — keep raising the rate until it's debuggable.

#### When you genuinely cannot build a loop

Stop and say so explicitly. List what you tried. Ask the user for: (a) access to whatever environment reproduces it, (b) a captured artifact (HAR file, log dump, failing payload, screen recording with timestamps), or (c) permission to add temporary instrumentation. Do **not** proceed to hypothesise without a loop.

#### Completion criterion — a tight loop that goes red

Phase 1 is done when the loop is **tight** and **red-capable**: you can name **one command** — a test invocation, a script path, a curl — that you have **already run at least once** (paste the invocation and its output), and that is:

- [ ] **Red-capable** — it drives the actual bug code path and asserts the **user's exact symptom**, so it can go red on this bug and green once fixed. Not "runs without erroring" — it must catch _this specific bug_.
- [ ] **Deterministic** — same verdict every run (flaky bugs: a pinned, high reproduction rate, per above).
- [ ] **Fast** — seconds, not minutes.
- [ ] **Agent-runnable** — you can run it unattended.

If you catch yourself reading code to build a theory before this command exists, **stop — jumping straight to a hypothesis is the exact failure this skill prevents.** No red-capable command, no Phase 2.

### Phase 2 — Reproduce + minimise

Run the loop. Watch it go **red** — the bug appears.

Confirm:

- [ ] The loop produces the failure mode the **user** described — not a different failure that happens to be nearby. Wrong bug = wrong fix.
- [ ] The failure is reproducible across multiple runs (or, for non-deterministic bugs, at a high enough rate to debug against).
- [ ] You captured the exact symptom (error message, wrong output, slow timing) so later phases can verify the fix addresses it.

#### Minimise

Once it's red, shrink the repro to the **smallest scenario that still goes red**. Cut inputs, callers, config, data, and steps **one at a time**, re-running the loop after each cut — keep only what's load-bearing for the failure.

Why bother: a minimal repro shrinks the hypothesis space in Phase 3 (fewer moving parts left to suspect) and becomes the clean regression test in Phase 5.

Done when **every remaining element is load-bearing** — removing any one of them makes the loop go green.

Do not proceed until you have reproduced **and** minimised.

### Phase 3 — Hypothesise

Generate **3–5 ranked hypotheses** before testing any of them. Single-hypothesis generation anchors on the first plausible idea.

Each hypothesis must be **falsifiable**: state the prediction it makes.

> Format: "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse."

If you cannot state the prediction, the hypothesis is a vibe — discard or sharpen it.

**Show the ranked list to the user before testing.** They often have domain knowledge that re-ranks instantly ("we just deployed a change to #3"), or know hypotheses they've already ruled out. Cheap checkpoint, big time saver. Don't block on it — proceed with your ranking if the user is AFK.

### Phase 4 — Instrument

Each probe must map to a specific prediction from Phase 3. **Change one variable at a time.**

Tool preference:

1. **Debugger / REPL inspection** if the env supports it (breakpoint, tinker). One breakpoint beats ten logs.
2. **Targeted logs** at the boundaries that distinguish hypotheses.
3. Never "log everything and grep".

**Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]`. Cleanup at the end becomes a single grep. Untagged logs survive; tagged logs die.

**Perf branch.** For performance regressions, logs are usually wrong. Instead: establish a baseline measurement (timing harness, query log, profiler, `EXPLAIN`), then bisect. Measure first, fix second.

### Phase 5 — Fix + regression test

Write the regression test **before the fix** — but only if there is a **correct seam** for it.

A correct seam is one where the test exercises the **real bug pattern** as it occurs at the call site. If the only available seam is too shallow (single-caller test when the bug needs multiple callers, unit test that can't replicate the chain that triggered the bug), a regression test there gives false confidence.

**If no correct seam exists, that itself is the finding.** Note it. The codebase architecture is preventing the bug from being locked down. Flag it for the post-mortem.

If a correct seam exists:

1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 feedback loop against the original (un-minimised) scenario.

**Regression test should replicate the issue first, then fix — always, wherever a seam exists.** This applies doubly to tracked-issue-sourced bugs.

If the bug came from a Sentry issue or Jira ticket, don't narrate it in prose inside the test. Reference the short ID/key in a one-line comment directly above the test and let the test body speak for itself — exact format in `resources/sentry.md` / `resources/jira.md`.

No paragraph explaining the issue, no pasted stack trace or description in a comment block — the ID is the pointer, the test body is the spec.

### Phase 6 — Cleanup + post-mortem

Required before declaring done:

- [ ] Original repro no longer reproduces (re-run the Phase 1 loop)
- [ ] Regression test passes (or absence of seam is documented)
- [ ] All `[DEBUG-...]` instrumentation removed (`grep` the prefix)
- [ ] Throwaway prototypes / harnesses deleted
- [ ] The hypothesis that turned out correct is stated in the commit / PR message — so the next debugger learns

**Then ask: what would have prevented this bug?** If the answer involves architectural change (no good test seam, tangled callers, hidden coupling), note the specifics and suggest running `/my-review` against the diff to catch related issues. Make the recommendation **after** the fix is in, not before — you have more information now than when you started.

## Output format

- The red-capable command run at least once, with its output pasted.
- The ranked hypothesis list shown to the user before testing.
- The regression test (or the documented absence of a correct seam).
- A closing post-mortem note naming the confirmed hypothesis and, if warranted, a suggestion to run `/my-review`.

## Anti-patterns to avoid

- Jumping to a hypothesis before a red-capable loop exists.
- Writing the fix before the regression test when a correct seam exists.
- Logging everything and grepping instead of targeted, hypothesis-mapped instrumentation.
- Declaring done with unremoved `[DEBUG-...]` instrumentation or throwaway harnesses still in the tree.
- Treating a 1%-reproduction-rate bug as debuggable without first raising the rate.

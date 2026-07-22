---
name: plan-inline
description: Prompt → grill → implement, all inline, no plan file. For small tasks where the agent would otherwise rush to an implementation too quickly. Grills the user on scope, then lets them choose between implementing inline now or escalating to a proper /plan, with a recommendation. Use when the user has a small-to-medium task that still needs a quick round of clarifying questions before coding.
---

# /plan-inline

Same spirit as `/plan` — resist rushing straight to code — but for work too small to justify a `.plans/{name}/` directory, a PRD, and an ARD. Everything happens in this session: no files written until the implementation step itself.

## Invocation

The user provides a free-text prompt describing what they want done. No feature name needed, nothing persisted.

## Process

### 1. Quick recon — direct, not dispatched

Do a light, direct look at the relevant part of the codebase yourself — `read`/`bash`/`grep`, no subagent dispatch. This task is small enough that spinning up `scout` is overkill.

- Find the file(s) most likely involved.
- Skim for existing conventions (naming, patterns, test style) you'll need to match later.
- Stop once you have enough to ask informed questions — 2–4 lookups, not a full audit.

### 2. Grill the user — one question at a time

Follow the `grill-me` approach: interview about the task until scope and acceptance criteria are unambiguous. Cover, as relevant:

- Exact behavior expected, including edge cases and failure modes
- Which existing file(s)/pattern(s) this should follow
- What "done" looks like (how it'll be verified)

Rules (same as `grill-me`/`review-plan`):
- Ask exactly **one question at a time**, via `ask_user`.
- If a question is answerable by reading the codebase, do that instead of asking.
- Every question states your recommendation immediately after it, in this exact format: `**Recommended:** {answer} — {one-sentence reason}`. If you truly have no default, write `**Recommended:** none — {why}`.
- Don't stop early. After the last open question, ask if the user has anything to add; only end the grill once they say no.

### 3. Scope checkpoint — ask before implementing

Before writing any code, stop and let the user choose the path, with your recommendation:

- **Implement inline now** — small, contained change: touches one or a handful of files, no new architecture, no cross-team/cross-module coordination, low uncertainty after the grill.
- **Escalate to `/plan`** — scope grew during the grill: touches multiple modules or a shared/core abstraction, needs a real design decision (data model, API contract, sequencing), has open questions the grill couldn't fully close, or the user will want a written record to review/hand off.

Ask via `ask_user`, structured like the grill questions:

> "Given what came out of the grill, is this small enough to implement right here, or does it deserve a proper `/plan` with a PRD/ARD?"
> `**Recommended:** {inline|/plan} — {one-sentence reason grounded in what the grill surfaced}`

If the user picks `/plan`: summarize the resolved answers from step 2 into a short enriched prompt (original ask + the grill's resolved decisions) and tell the user to run `/plan` with it — don't run it for them, since `/plan` has its own invocation flow. Stop here.

If the user picks inline: continue to step 4.

### 4. Implement inline

Read `~/.pi/agent/agents/implementer.md` in full and follow its Step 2/3 contract (SOLID, TDD vertical slices, idiomatic-code matching, targeted CI) directly in this session, adapted for the fact there is no task file or ARD:

- Treat the resolved answers from step 2 as the task spec in place of a task file.
- Skip anything in `implementer.md` that only makes sense with a `.plans/{name}/` structure (reading `context.md`/`ard.md`, marking a task file done, `tasks.md` bookkeeping) — none of that exists here.
- Everything else applies as written: read existing `AGENTS.md`/instruction files in scope before touching code, mirror an analogous existing test before writing a new one, one test → one implementation slice at a time, run targeted CI (formatter, type-check, only the tests covering this change) before reporting done.
- The escalation rules and hard constraints in `implementer.md` apply unchanged — including never committing.

### 5. Stop and hand back

Report what was implemented and the targeted CI output, same shape as `implementer.md`'s output format. Suggest `/review` to review and commit — this skill never commits.

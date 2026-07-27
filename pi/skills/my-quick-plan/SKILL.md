---
name: my-quick-plan
description: >
  Grill a small task, checkpoint scope, then implement inline with no plan files. Use this
  skill when the user says "quick plan", "plan inline", wants quick clarification before
  coding, or has work too small for my-plan. Recommends escalating to my-plan if scope grows
  during the grill. Do NOT use for net-new .plans/{name} planning (my-plan), existing plan
  follow-up/review (my-follow-up-plan, my-review-plan), or task breakdown (my-plan-to-tasks).
version: 1.0.0
---

# /my-quick-plan

Same spirit as `/my-plan` — resist rushing straight to code — but for work too small to justify a `.plans/{name}/` directory, a PRD, and an ARD. Everything happens in this session: no files written until the implementation step itself.

## When to use

The user provides a free-text prompt describing what they want done. No feature name needed, nothing persisted.

- Use when the task is small-to-medium but still needs clarifying questions before coding.
- Use when the user wants the spirit of `/my-plan` without creating a `.plans/{name}/` directory.

## When NOT to use

- For work that deserves a `.plans/{name}/` directory, a PRD, and an ARD, use `/my-plan` — it will recommend redirecting here if it judges the scope small enough, but you don't have to wait for that.
- If scope grows during the grill, escalate to `/my-plan` rather than forcing inline implementation.
- To revisit or refine an existing plan, use `my-follow-up-plan` or `my-review-plan`.
- To break an existing reviewed plan into tasks, use `my-plan-to-tasks`.

## Process

### 1. Quick recon — direct, not dispatched

Do a light, direct look at the relevant part of the codebase yourself — `read`/`bash`/`grep`, no subagent dispatch. This task is small enough that spinning up a dedicated recon subagent is overkill.

- Find the file(s) most likely involved.
- Skim for existing conventions (naming, patterns, test style) you'll need to match later.
- Stop once you have enough to ask informed questions — 2–4 lookups, not a full audit.

### 2. Grill the user — one question at a time

Follow the `my-grill-me` approach: interview about the task until scope and acceptance criteria are unambiguous. Cover, as relevant:

- Exact behavior expected, including edge cases and failure modes
- Which existing file(s)/pattern(s) this should follow
- What "done" looks like (how it'll be verified)

Rules (same as `my-grill-me`/`my-review-plan`):

- Ask exactly **one question at a time**, via `ask_user`.
- If a question is answerable by reading the codebase, do that instead of asking.
- Every question states your recommendation immediately after it, in this exact format: `**Recommended:** {answer} — {one-sentence reason}`. If you truly have no default, write `**Recommended:** none — {why}`.
- Don't stop early. After the last open question, ask if the user has anything to add; only end the grill once they say no.

### 3. Scope checkpoint — ask before implementing

Before writing any code, stop and let the user choose the path, with your recommendation:

- **Implement inline now** — small, contained change: touches one or a handful of files, no new architecture, no cross-team/cross-module coordination, low uncertainty after the grill.
- **Escalate to `/my-plan`** — scope grew during the grill: touches multiple modules or a shared/core abstraction, needs a real design decision (data model, API contract, sequencing), has open questions the grill couldn't fully close, or the user will want a written record to review/hand off.

Ask via `ask_user`, structured like the grill questions:

> "Given what came out of the grill, is this small enough to implement right here, or does it deserve a proper `/my-plan` with a PRD/ARD?"
> `**Recommended:** {inline|/my-plan} — {one-sentence reason grounded in what the grill surfaced}`

If the user picks `/my-plan`: summarize the resolved answers from step 2 into a short enriched prompt (original ask + the grill's resolved decisions) and tell the user to run `/my-plan` with it — don't run it for them, since `/my-plan` has its own invocation flow. Stop here.

If the user picks inline: continue to step 4.

### 4. Implement inline

Follow [`references/implementation-contract.md`](references/implementation-contract.md)'s Step 2/3 contract (SOLID, TDD vertical slices, idiomatic-code matching, targeted CI) directly in this session, adapted for the fact there is no task file or ARD:

- Treat the resolved answers from step 2 as the task spec in place of a task file.
- Skip anything in the contract that only makes sense with a `.plans/{name}/` structure (reading `context.md`/`ard.md`, marking a task file done, `tasks.md` bookkeeping) — none of that exists here.
- Everything else applies as written: read existing `AGENTS.md`/instruction files in scope before touching code, mirror an analogous existing test before writing a new one, one test → one implementation slice at a time, run targeted CI (formatter, type-check, only the tests covering this change) before reporting done.
- The escalation rules and hard constraints in the contract apply unchanged — including never committing.

### 5. Stop and hand back

Report what was implemented and the targeted CI output, same shape as the contract's output format. Suggest `/my-review` to review and commit — this skill never commits.

## Output format

Report what was implemented and the targeted CI output, same shape as the contract's output format. Suggest `/my-review` to review and commit — this skill never commits.

## Anti-patterns to avoid

- Don't dispatch a dedicated recon subagent; this skill's recon stays direct and light.
- Don't ask the user questions the codebase can answer; read first.
- Don't ask more than one question at a time, and don't end the grill before the user says they have nothing to add.
- Don't skip the scope checkpoint before writing code; the user must choose inline vs `/my-plan`.
- Don't commit; this skill stops after implementation and targeted CI.

---
name: my-review-plan
description: >
  Stress-test a plan's PRD and ARD by auditing them for real problems, then grilling the user on
  those. Use this skill when the user says review plan, refine plan, or sanity-check a draft
  before task breakdown. Do NOT use for net-new planning (my-plan, my-quick-plan), follow-up
  changes to an existing plan (my-follow-up-plan), or task grooming (my-plan-to-tasks).
version: 2.0.0
---

# /my-review-plan

Find what's wrong with an existing plan, grill the user on it, and correct the documents in place.

This is an **audit**, not a completeness sweep. `/my-plan` already grilled the user and already followed codebase precedent; the documents are deliberately terse. Your job is to find contradictions, wrong assumptions, and real risks — not to fill every silence you notice. Terse is the goal state, not a defect.

By the time this runs, the user has likely hand-edited `prd.md`/`ard.md` (fixed the tree, adjusted contracts, left notes) — that's the expected flow between `/my-plan` and here. Read the files as they currently stand.

## When to use

- The user passes the plan name (matching the directory under `.plans/`) and wants to review, refine, or stress-test the plan before implementation grooming.
- If no name is given, check the `.plan` symlink at the repo root; if it resolves to a directory under `.plans/`, use that plan. If it's missing or broken, list the available plans and ask which one to review.
- Use this before `/my-plan-to-tasks` in the intended planning pipeline.

## When NOT to use

- Do not use this skill for net-new planning work; use `/my-plan` for a persisted plan or `/my-quick-plan` for small inline planning.
- Do not use this skill when the user wants to continue, revise, or build on an existing plan with new follow-up scope; use `/my-follow-up-plan` instead.
- Do not use this skill when the plan is already reviewed and the user wants an ordered implementation breakdown; use `/my-plan-to-tasks` instead.

## Process

### 1. Load the plan

Resolve `{name}` per "When to use" above, then point `.plan` at it: `ln -sfn .plans/{name} .plan`.

Read both `.plans/{name}/prd.md` and `.plans/{name}/ard.md` in full.

### 2. Load codebase context

Read `.plans/{name}/context.md`. Written during `/my-plan`, it holds the codebase findings, the precedent the structure was based on, and every decision already settled with the user. Trust it. Only read source files to verify something the ARD claims, or where the plan references something context.md doesn't cover.

If `context.md` has a `## Reference Documents` section, treat those `.plans/{name}/references/*.md` files as the source for anything the interview needs from that external URL — read the cached file, do not re-fetch the URL. If the interview surfaces a new URL not already cached, fetch it once, save it to `.plans/{name}/references/{slug}.md` with the same `source`/`fetched` frontmatter used during `/my-plan`, and append it to `context.md`'s `## Reference Documents` section so later phases reuse it too.

Also read the repo root `AGENTS.md` and any `AGENTS.md`/instruction files nested under the directories the ARD's `Structure` touches. These hold naming conventions (filenames, purposes, casing, suffixes) the proposed tree must follow.

### 3. Audit the plan for problems

Go looking for things that are **wrong**, not things that are absent. A silence is only a finding if acting on the plan as written would produce the wrong result. Check, in this order:

- **Contradictions**: the ARD's structure or contracts conflict with the PRD, with the PRD's Out of Scope, with `context.md`'s recorded decisions, or with themselves.
- **Wrong against reality**: a path, module, interface or column the ARD names doesn't exist as described (or already exists, differently). Verify against the codebase — this is the highest-value check.
- **Broken precedent**: something in the tree doesn't match how this codebase does that thing, or introduces an abstraction with no counterpart anywhere in the repo.
- **Contracts that can't work**: a DTO/payload missing a field the flow demonstrably needs, a type that can't carry the stated value, a placeholder that blocks implementation.
- **Unhandled failure modes** that a user story actually implies — not every theoretical error path.
- **Risky assumptions**: the plan depends on unmerged work, another team, or an external system behaving a particular way, and doesn't say so.
- **Stale Open Questions**: anything still marked `[NEEDS CLARIFICATION]`.
- **Terminology drift**: a domain term used differently from `CONTEXT.md`'s glossary or from itself.
- **Naming convention violations**: a filename (or, where defined, a file's stated purpose) in the ARD's `Structure` doesn't follow the conventions set out in `AGENTS.md` or other applicable instruction files (casing, suffixes, directory placement, one-purpose-per-file rules, etc.).

What is explicitly **not** a finding: a section being short, a rationale not being written down, a testing note missing from `ard.md` (that lives in `context.md`), a file lacking an explanatory comment, or a decision the user already made in `/my-plan`'s grill.

If the audit turns up nothing real, say so and stop — flipping status to `reviewed` with no changes is a valid outcome. Do not manufacture questions to justify the run.

### 4. Grill the user on the findings — one question at a time

Follow the `my-grill-me` approach for each finding from step 3. Interview until every real finding is resolved — don't cap the interview to save turns, but don't extend it past the findings either.

Open by asking the user for their own read on the plan (what's off, what worries them). Fold whatever they raise into the findings list and grill on it alongside.

Rules:
- Ask exactly **one question at a time**
- If a question can be answered by exploring the codebase, do that instead of asking
- Don't move on until the current question is resolved
- Every question must trace to a specific finding or something the user raised
- Once the findings are exhausted, ask the user if they have anything further to add. If they raise something, resolve it and ask again. Only conclude once they explicitly say they have nothing to add.

**Every question must use this exact structure, in this exact order:**

1. The question itself, stated as a single sentence.
2. Your recommendation, on its own line, in this exact format: `**Recommended:** {answer} — {one-sentence reason}`
3. If you genuinely have no reasonable default, write `**Recommended:** none — {why no default exists}` instead of omitting the line.

Never skip step 2. Never phrase the recommendation as optional or bury it after the question text — it must always appear immediately after the question, before you wait for the user's answer.

### 5. Capture durable artifacts as you grill

A grill that only updates the plan files loses its insights the moment the plan is archived. Capture as you go, inline, not in a batch at the end:

- Rationale, alternatives ruled out, testing notes, and every grill answer → `.plans/{name}/context.md` (agent-only, uncapped — this is where prose belongs)
- Resolved or sharpened **domain terms** → the project glossary (`CONTEXT.md`), via `my-domain-modeling`
- **Hard-to-reverse, surprising, real-trade-off** decisions → an ADR in `docs/adr/`, via `my-domain-modeling`

Apply `my-domain-modeling`'s ADR bar — most decisions don't warrant one.

### 6. Correct the documents in place

Once the interview is complete, edit `prd.md` and `ard.md` to reflect what was settled. **Edit, don't rewrite** — leave untouched anything the audit didn't flag.

Hard rules:

- The documents must not grow in shape. `ard.md` keeps exactly its existing sections: `Structure`, `Data Contracts`, `Other`, and `Out of Scope` / `Open Questions` where applicable. Do not add sections. Do not add rationale, decision, approach, testing, or module-boundary prose — that goes in `context.md`.
- `prd.md` stays technology-agnostic throughout: no file paths, class names, frameworks, libraries or table names (naming an external system/integration the product depends on is the one exception).
- Every grill answer's *reasoning* lands in `context.md`; only the resulting fact lands in `ard.md`.
- Fix what was wrong, replace resolved placeholders with concrete values, delete resolved Open Questions.
- Keep the user's intent and scope — don't over-engineer.
- Update _Status_ from `draft` to `reviewed` in both files.

If the corrected `ard.md` is longer than the one you started with, check whether the extra length is fact or justification. Justification comes back out.

### 7. Wrap up

Tell the user:

- What changed in each document (and if nothing needed changing, say that)
- What was recorded in `context.md`, plus any glossary terms or ADRs captured (with paths)
- Any questions that remain open (and why)
- Next step: run `/my-plan-to-tasks {name}` to break the ARD into tasks

## Output format

- Corrected `.plans/{name}/prd.md` and `.plans/{name}/ard.md`, plus any additions to `.plans/{name}/context.md`
- A final wrap-up stating what changed, what was recorded where, any remaining open questions, and the next step: `/my-plan-to-tasks {name}`

## Anti-patterns to avoid

- Do not run a completeness sweep — audit for what's wrong, not for what's unsaid.
- Do not treat terseness, missing rationale, or a short section as a finding.
- Do not add sections to `ard.md` or move `context.md` material into it.
- Do not re-litigate decisions the user already settled during `/my-plan`'s grill.
- Do not re-explore the codebase broadly when `.plans/{name}/context.md` already answers the question — but do verify paths and interfaces the ARD names actually exist.
- Do not ask multiple questions at once or advance before the current question is resolved.
- Do not accept vague answers where exact names and types are required.
- Do not finish the interview before the user explicitly says they have nothing further to add.
- Do not over-engineer or change the user's intended scope.

---
name: my-review-feature
description: >
  Stress-test an epic's PRD and ARD with a grill-me interview, then rewrite both files in place.
  Use this skill when the user says review feature, refine epic, or wants to resolve open
  questions in a .features/{name}/ dir before spinning off /my-plan slices. Do NOT use for
  net-new epic drafting (my-feature), plan-level review (my-review-plan), or task breakdown
  (my-plan-to-tasks).
version: 1.3.0
---

# /my-review-feature

Stress-test and refine an existing epic through a focused interview, then update its documents
to reflect shared understanding — the same job `/my-review-plan` does for a single plan, one
level up. This is where an epic's `_Status_` moves from `draft` to `reviewed`; nothing else in
the workflow flips it.

By the time this runs, the user has likely hand-edited `prd.md`/`ard.md` already. Read the files
as they currently stand, don't assume they still match what `/my-feature` originally drafted.

## When to use

- The user passes the feature name (matching the directory under `.features/`) and wants to
  review, refine, or stress-test the epic before treating it as settled ground for `/my-plan`
  slices.
- If no name is given, check the `.feature` symlink at the repo root; if it resolves to a
  directory under `.features/`, use that feature. If missing or broken, list the available
  features and ask which one.
- Use any time after `/my-feature` — commonly right away, but also later if a plan underneath
  surfaces something that should be resolved at epic level instead of re-litigated per-plan.

## When NOT to use

- Do not use for net-new epic drafting; use `/my-feature`.
- Do not use for a single plan's PRD/ARD; use `/my-review-plan`.
- Do not use to break a plan into tasks; use `/my-plan-to-tasks`.

## Process

### 1. Load the feature

Resolve `{name}` per "When to use" above, then point `.feature` at it: `ln -sfn .features/{name} .feature`.

Read `context.md`, `prd.md`, `ard.md` in full, and `plans.md` too if it exists yet — it often won't, since `/my-plan` creates it lazily on the first real plan and review commonly happens before any plan exists.

### 2. Load codebase context

`context.md` was written during `/my-feature` at Medium recon thoroughness — trust it, don't
re-explore broadly. Only read additional source files if the interview surfaces something
`context.md` doesn't cover.

If `context.md` has a `## Reference Documents` section, treat `.features/{name}/references/*.md`
as the source for anything the interview needs from an external URL — read the cached file,
don't re-fetch. If a new URL surfaces, cache it the same way `/my-feature` step 4 does and append
it to `context.md`.

If `context.md` has a `## Pre-existing plans` section (prior-art `.plans/` dirs recon noticed during `/my-feature`), skim each one's `context.md`/`prd.md` status lines only (not full contents) — enough to know whether they conflict with the epic, not to re-review them individually. If `plans.md` exists and already has rows (real plans created since this feature was drafted), do the same for those.

### 3. Scan the epic against a fixed taxonomy

Go through this exact list before interviewing. Mark each `Clear`, `Partial`, or `Missing`. Don't
skip a category because it seems unlikely to apply — mark it `Clear` if it clearly doesn't.

- **Problem/solution framing**: PRD's Problem Statement and Solution are concrete, not generic; every user story maps to something in Solution
- **Success criteria**: every user story has a measurable, technology-agnostic success criterion
- **Anticipated plan breakdown**: each item passes [`references/plan-boundary-spine.md`](references/plan-boundary-spine.md)'s PR-worthy test and is scoped tightly enough to become a real `/my-plan` prompt, not just a label; check for missing spine points (e.g. a read path with no corresponding write path, or UI shipped with no presentation-scaffold stub before it) and for two independently-shippable capabilities folded into one row
- **Module boundaries**: every module named in the ARD has a stated reason it's in scope and what it owns vs. doesn't
- **Sequencing**: every Anticipated Plan Breakdown item's `depends on` annotation is stated, not implied, and matches reality (nothing downstream silently assumed to exist); `ard.md` has no separate ordering section duplicating or contradicting it
- **Cross-team dependencies**: every external dependency names an owner or a concrete unknown, not a vague "someone should check"
- **Risks**: each risk has a stated consequence, not just a label
- **Terminology**: domain terms in `prd.md`/`ard.md` match `CONTEXT.md`'s glossary (if one exists) and match each other
- **Open questions**: every item in the ARD's Implementation Notes "Open Questions" is a real, answerable question
- **Conflicts with prior/in-flight plans**: any plan named in `context.md`'s `## Pre-existing plans` section or already present in `plans.md` that contradicts this epic's decisions is named as a conflict to resolve, not silently ignored

Every `Partial`/`Missing` category becomes at least one interview question. Resolve `Missing`
before `Partial`, in taxonomy order above.

### 4. Interview the user — one question at a time

Follow the `my-grill-me` approach: interview relentlessly until shared understanding is reached.
Asking many questions is correct and expected — never shorten or cap the interview to save turns.

Open by asking the user's own first take on the epic (what worries them, what feels unsettled)
before working the taxonomy — fold anything they raise into the scan from step 3.

Rules:
- Ask exactly **one question at a time**.
- If a question can be answered by exploring the codebase, do that instead of asking.
- Don't move to the next question until the current one is resolved.
- Don't stop early — exhaust every meaningful open question before concluding.
- After every other question is resolved, ask if there's anything further to add. If they raise
  something, resolve it and ask again. Only finish once the user explicitly says there's nothing
  further.

**Every question must use this exact structure, in this exact order:**

1. The question itself, stated as a single sentence.
2. Your recommendation, on its own line: `**Recommended:** {answer} — {one-sentence reason}`.
3. If you genuinely have no reasonable default: `**Recommended:** none — {why no default exists}`.

Never skip step 2 or bury it.

### 5. Capture durable artifacts as you grill

Same as `/my-review-plan` step 5 — use `my-domain-modeling` inline as terms sharpen or
hard-to-reverse decisions get made:

- Resolved/sharpened domain terms → `CONTEXT.md`
- Hard-to-reverse, surprising, real-trade-off decisions → an ADR in `docs/adr/`

Apply `my-domain-modeling`'s ADR bar — an epic surfacing many decisions doesn't mean most of them
warrant one.

### 6. Update the epic documents in place

Rewrite `prd.md` and `ard.md` to reflect the shared understanding:

- Update `_Status_` from `draft` to `reviewed` — this is the only place that happens.
- Fill in gaps identified during the interview.
- Replace ambiguous language with precise decisions.
- Clear out resolved Open Questions bullets, or note the resolution inline.
- Tighten the Anticipated Plan Breakdown list if the interview changed how the work splits — re-run it against [`references/plan-boundary-spine.md`](references/plan-boundary-spine.md)'s spine and PR-worthy test, tagging each item with the spine point it came from and keeping its `depends on` annotation accurate. This list stays the epic's only sequence — do not add or restore a `## Sequencing` section to `ard.md`.
- Keep the user's original intent and altitude — don't drop to plan-level detail (data
  contracts, file-by-file diffs); that still belongs in the plans this epic spawns.
- Keep both files terse — fragments over sentences, interview answers compressed to the
  essential fact, not transcribed.

Write the updated documents back to `.features/{name}/prd.md` and `.features/{name}/ard.md`.

### 7. Wrap up

Tell the user:

- What changed in each document.
- Any glossary terms or ADRs captured (with paths).
- Any questions that remain open, and why.
- Any conflicts flagged against `plans.md` rows, and what the user should do about them.
- Next step: start slicing with `/my-plan {first piece of work}` — while `.feature` stays
  active, each plan inherits this reviewed context automatically.

## Output format

- Updated `.features/{name}/prd.md` and `.features/{name}/ard.md`
- A final wrap-up: what changed, glossary/ADR artifacts, remaining open questions, `plans.md`
  conflicts, next step (`/my-plan {first piece}`)

## Anti-patterns to avoid

- Do not re-run `/my-feature`'s recon broadly when `context.md` already answers the question.
- Do not ask multiple questions at once or advance before the current one is resolved.
- Do not finish before the user explicitly says they have nothing further to add.
- Do not drop to plan-level detail while rewriting — that's what child plans are for.
- Do not silently resolve a `plans.md` conflict yourself; surface it and let the user decide.

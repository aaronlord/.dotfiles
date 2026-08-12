---
name: my-plan
description: >
  Draft PRD/ARD plan files from a prompt. Use this skill when the user says "plan", wants a
  new feature plan, or needs a fresh .plans/{name}/ scaffold. Recommends redirecting to
  my-quick-plan if the prompt turns out to be small scoped work. Do NOT use for small scoped
  work (my-quick-plan), existing-plan follow-ups/review (my-follow-up-plan, my-review-plan), or
  task breakdown (my-plan-to-tasks).
version: 2.0.0
---

# /my-plan

Create a new plan for a feature or piece of work.

The human reads `prd.md` and `ard.md`; `context.md` is for agents only. `ard.md` is a notepad sketch — file tree, data contracts, non-file items — not an architecture essay. Structure comes from precedent found in this codebase, and anything with no precedent is asked, not guessed. Keep the tree focused on production-facing files; omit test files and test directories from the planning-stage structure. Bias toward terse and editable over complete and polished.

## When to use

The user provides a free-text prompt describing what they want to build. Do not require a feature name — infer one.

- Use for creating a brand-new `.plans/{name}/` plan with `context.md`, `prd.md`, and `ard.md`.

## When NOT to use

- For work too small to justify a `.plans/{name}/` directory, a PRD, and an ARD, use `my-quick-plan`.
- If `.plans/{name}/` already exists, use `my-follow-up-plan` instead of overwriting.
- To stress-test or refine an existing drafted plan, use `my-review-plan`.
- To break a reviewed plan into tasks, use `my-plan-to-tasks`.

## Process

This skill is an orchestrator, not a drafter: it dispatches recon, grills the user on what recon couldn't answer, dispatches drafting, and persists what comes back. It does not explore the codebase or write PRD/ARD prose itself — [`references/recon.md`](references/recon.md) and [`references/drafting.md`](references/drafting.md) do, each with their own bounded scope. The grill in step 6 is this skill's job alone; the drafter never asks the user anything.

### 0. Resolve against the active feature before judging size or clarity

Before anything else — before the scope check below, before deciding a terse prompt needs clarification — check whether a `.feature` symlink exists at the repo root. If it does, this prompt is very likely a slice of that active feature, even if it's just a short name/slug with no description.

Read `.features/{feature-name}/prd.md`'s Anticipated Plan Breakdown and `ard.md`'s Module Boundaries / Illustrative Structure once. If the prompt exactly matches, prefix-matches, or closely paraphrases a breakdown item, or clearly names a module/capability sketched in the ARD — even one narrower than any single breakdown item (e.g. just the presentation-scaffold slice of a module the ARD only described as a whole) — that material supplies the scope. Proceed straight to step 1 using it; do not ask the user to describe the work from scratch just because the prompt itself is short.

Only fall back to treating the prompt as under-specified if, after checking the active feature's own documents, it still doesn't map to anything there (or no `.feature` is active at all). In that case, `ask_user` for what the work actually is before continuing.

### 1. Scope check — small work belongs in `my-quick-plan`

Once the prompt is scoped (either directly, or via the active-feature check above), judge whether it's actually small enough that a persisted `.plans/{name}/` directory, PRD, and ARD are overkill: touches one or a handful of files, no new architecture or data-model decision, no cross-module/cross-team coordination, low ambiguity even before any clarifying questions.

If it looks that small, ask via `ask_user` before doing anything else:

> "This looks small enough to grill and implement directly — want me to switch to `/my-quick-plan` instead of drafting a full PRD/ARD?"
> `**Recommended:** {/my-quick-plan|full plan} — {one-sentence reason grounded in the prompt}`

If the user picks `/my-quick-plan`: don't run it for them, since it has its own invocation flow — but don't make them go dig up the original prompt either. Print a ready-to-copy command line:

> `/my-quick-plan {original prompt, folded in with any clarifying detail recon surfaced}`

Stop here.

If the user picks the full plan, or the prompt is clearly not small (multi-module, new abstraction, needs a written record): continue to step 2.

### 2. Infer the feature name

Derive a short, lowercase kebab-case name from the prompt (e.g. `"sync students from Wonde"` → `wonde-sync`). If step 0 matched this prompt to a specific Anticipated Plan Breakdown item, use that item's `{rough-plan-name}` as the inferred name directly — don't re-derive a different slug for the same slice. Show the inferred name to the user and proceed — don't ask for confirmation unless it's genuinely ambiguous.

### 3. Check for an existing plan

If `.plans/{name}/` already exists, tell the user and point them at the `my-follow-up-plan` skill instead of overwriting — it handles both updating the existing plan in place and starting a new plan seeded with the old one's context. Stop here.

### 4. Recon: find precedent

Follow [`references/recon.md`](references/recon.md). **Always dispatch this to a subagent** (e.g. the generic `worker` agent via the `subagent` tool) — it reads real source in depth and that depth must not land in this session's context. This is lookup work, not judgement work: use `model-matrix.md`'s `lightweight/generator` model/thinkingLevel (`mai-code-1-flash-picker` · low) — pass it explicitly as `model`/`thinkingLevel` params on the `subagent` call rather than guessing a model name. Only fall back to the `subagent` tool's own default (per `~/.pi/agent/extensions/model-matrix/general.md`'s Fallback section) if `model-matrix.md` is missing.

Use:

- The user's original prompt.
- Depth: **targeted deep** — read the 2–3 nearest sibling implementations in full; do not survey broadly.
- The instruction that its primary deliverable is the **Precedent Map** (what each new thing should be named and where it lives, copied from existing code) and the **No Precedent Found** list.
- If a `.feature` symlink exists at the repo root, its `context.md` and `prd.md` as extra input — this plan is a slice of that active feature.

Recon's output feeds two things: the grill in step 6 (its No Precedent Found list) and the drafter in step 8 (its Precedent Map, verbatim).

### 5. Cache any URLs the user provided

If the user's prompt includes one or more URLs, fetch each one **once** and cache it locally instead of re-fetching it in every later phase (`/my-review-plan`, `/my-plan-to-tasks`, `/my-implement-task`, `/my-implement-tasks` all reuse the cache).

For each URL:

- Fetch the page.
- Save it to `.plans/{name}/references/{slug}.md`, where `{slug}` is a kebab-case name derived from the URL (host + meaningful path segments).
- Prefix the saved file with frontmatter recording the source and fetch date:

```
---
source: {url}
fetched: {ISO date}
---
```

- Follow the frontmatter with the fetched content, trimmed to what's relevant if the page is very long (strip nav/boilerplate, keep the substantive sections).

Pass a short pointer per URL (path + one-line description, not the full text) to the drafting step in step 8, so it can cite the cached file instead of the raw URL.

### 6. Grill the user — product first, then implementation

Ask before anything is drafted. Rewriting a drafted ARD is expensive for the user; answering a question is cheap. Follow `my-grill-me`'s rules: exactly **one question per `ask_user` call**, resolve it before asking the next, and every question carries a recommendation on its own line immediately after the question:

`**Recommended:** {answer} — {one-sentence reason}`

Bounded by relevance, not by count — there is no question cap, but every question must earn its place.

**Phase 1 — product.** Ask only where the answer changes `prd.md`: an actor, scenario, edge case, success criterion, or scope boundary that is genuinely ambiguous. Skip anything the prompt, recon, or the parent feature's PRD already answers. Often this is zero questions.

**Phase 2 — implementation.** Ask only about recon's **No Precedent Found** items, plus anything where recon found two conflicting precedents and the choice matters. Where recon found clear precedent, follow it silently — do not ask the user to confirm what the codebase already does. Where a convention doc is silent or marked "work in progress" on something this plan needs, that's a no-precedent item: ask.

Record every answer; it goes to the drafter in step 8 and lands in `context.md`.

### 7. Create the scaffold

```
.plans/{name}/
  context.md   ← written in step 8, agent-only (the human doesn't read it)
  prd.md
  ard.md
  references/  ← cached URL fetches from step 5, if any
  tasks/       ← empty for now, created by /my-plan-to-tasks
```

Point the active-plan symlink at it: `ln -sfn .plans/{name} .plan`. Downstream skills
(`/my-review-plan`, `/my-plan-to-tasks`, `/my-implement-task(s)`, `/my-follow-up-plan`) read this
symlink when the user doesn't name a plan explicitly.

### 8. Draft the documents

Follow [`references/drafting.md`](references/drafting.md) for the drafting step — dispatch it to an isolated subagent (e.g. the generic `worker` agent via the `subagent` tool) if you want drafting kept uncontaminated by exploration reasoning, otherwise perform it directly yourself. If dispatched, use `model-matrix.md`'s `versatile/generalist` model/thinkingLevel (`claude-sonnet-5` · medium) — this is judgment/prose work, not bulk generation — passed explicitly as `model`/`thinkingLevel` params rather than guessed. Either way, use:

- The user's original prompt.
- The inferred feature name.
- The recon findings from step 4, verbatim — the Precedent Map especially.
- Every grill answer from step 6.
- Any cached reference pointers from step 5 (path + one-line description per URL).

If the drafter comes back with a class, interface or directory that traces to neither the Precedent Map nor a grill answer, that's an invention — send it back or strip it. Same for an `ard.md` carrying sections outside `Structure` / `Data Contracts` / `Other` / `Out of Scope` / `Open Questions`, or carrying rationale prose that belongs in `context.md`.

The drafting step returns three content blocks (`context.md`, `prd.md`, `ard.md`) already self-reviewed against its own precedent/section/PRD-purity/contracts/coverage scan.

Write each returned block to its path under `.plans/{name}/` exactly as returned — this skill does not edit the drafted prose, only persists it.

If a `.feature` symlink exists at the repo root (resolved to `.features/{feature-name}/`), this plan is a slice of that active feature:

- Prepend a frontmatter block to the written `context.md`: `---\nparent_feature: {feature-name}\n---` followed by a blank line, then the drafted content.
- Append a row to `.features/{feature-name}/plans.md`'s table: `.plans/{name}/` linked, status `draft`, notes blank. If `plans.md` doesn't exist yet (this is the first plan created under this feature), create it first with the standard header:

  ```
  # Plans: {Feature Name}

  | # | Plan | Status | Notes |
  | - | ---- | ------ | ----- |

  ## Progress

  _0 plans started_
  ```

  then append the row and update the progress line. Don't touch any other existing row.

If drafting surfaces a new domain term that needs pinning down, or a hard-to-reverse decision worth recording separately, tell the user to run the `my-domain-modeling` skill rather than trying to fold that material back into the PRD/ARD yourself.

### 9. Stop and hand back

Once the files are written, tell the user:

- The path to the plan: `.plans/{name}/` (now the active plan — `.plan` symlink points at it)
- A brief summary of what was drafted (from the returned `prd.md`/`ard.md` content)
- Any open questions surfaced in `ard.md`'s Open Questions section (if it has one)
- If a `.feature` symlink was active: which feature this plan is linked to, and that `.features/{feature-name}/plans.md` was updated.
- Next step: **go review and hand-edit `prd.md`/`ard.md` first** (fix the tree, adjust contracts, drop in notes) — they're a terse sketch, not a finished spec. Then run `/my-review-plan {name}` to stress-test.

## Output format

- Written: `.plans/{name}/{context,prd,ard}.md`
- Reported: summary, open questions, next step (see step 9)

## Anti-patterns to avoid

- Don't ask the user for a feature name if it can be inferred from the prompt.
- Don't ask the user to describe the work when `.feature` is active and the prompt already maps to its Anticipated Plan Breakdown or ARD — resolve it there first, per step 0.
- Don't overwrite an existing `.plans/{name}/`; hand off to `my-follow-up-plan`.
- Don't let recon go broad; it reads a few sibling implementations deeply, not the whole app.
- Don't ask the user to confirm a convention the codebase already demonstrates — follow precedent silently, grill only where there is none.
- Don't let an invented port, service layer, wrapper or interface into `ard.md` because it looks architecturally tidy; if it isn't in the Precedent Map or a grill answer, it doesn't exist.
- Don't let rationale, alternatives, or testing notes into `ard.md`; they go in `context.md`.
- Don't include test files or test directories in `ard.md`'s Structure; planning trees stay focused on production surface area.
- Don't let `prd.md` name files, classes, frameworks or tables (external systems/integrations excepted).
- Don't edit the drafted prose yourself; write each returned block to its path exactly as returned.
- Don't guess a model name for the recon/drafting subagent dispatch; look up `model-matrix.md`'s `lightweight/generator` (recon) and `versatile/generalist` (drafting) rows.

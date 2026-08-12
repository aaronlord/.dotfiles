---
name: my-feature
description: >
  Draft a high-level PRD/ARD/context for a large feature or epic that will span many /my-plan
  runs and commits, often across a team. Use this skill when the user says "epic", "big
  feature", or wants pre-context to seed multiple future /my-plan invocations. Do NOT use for
  scoped work that fits one plan (my-plan) or small work (my-quick-plan).
version: 1.4.0
---

# /my-feature

Draft the epic-altitude pre-context that later `/my-plan` runs build on. One `.features/{name}/`
can spawn many `.plans/{name}/` over weeks — this skill only ever produces the high-level
`context.md`/`prd.md`/`ard.md` trio. It never breaks work into tasks itself, and it never
touches `plans.md` — that file tracks *actual* plans as they get created, and only `/my-plan`
writes to it (lazily creating it on the first plan). The Anticipated Plan Breakdown in `prd.md`
is the single place the proposed order/split lives until reality overtakes it.

## When to use

The user provides a free-text prompt describing a large body of work — a feature that will take
many commits, likely spans a team, and will need multiple `/my-plan` cycles to actually build.

## When NOT to use

- Work that fits in one `.plans/{name}/` — use `/my-plan` directly.
- Small scoped work — use `/my-quick-plan`.
- No scope-check redirect step here: invoking `/my-feature` at all is itself the signal this is
  big enough to warrant it.

## Process

Orchestrator, not drafter: gathers inputs, runs recon and drafting (ideally as isolated
subagents/background tasks, falling back to doing them directly in this session), persists what
comes back. [`references/recon.md`](references/recon.md) and
[`references/drafting.md`](references/drafting.md) do the actual exploring/writing, each with
its own bounded scope.

### 1. Infer the feature name

Derive a short, lowercase kebab-case name from the prompt. Show it to the user, proceed — don't
ask for confirmation unless genuinely ambiguous.

### 2. Guard against overwriting an existing feature

If `.features/{name}/` already exists, use `ask_user` before doing anything else: overwrite,
pick a different name, or stop. Do not silently overwrite — this directory gets hand-edited by
the human and by every `/my-plan` run underneath it.

### 3. Recon: epic-altitude, but real exploration

Follow [`references/recon.md`](references/recon.md) for the recon step — dispatch to an isolated
subagent (e.g. the generic `worker` agent via the `subagent` tool) if you want a clean context,
otherwise perform it directly. Use:

- The user's original prompt.
- Explicit thoroughness: **Medium** — follow imports, read critical sections, understand real
  architecture. This runs far less often than `/my-plan` and seeds many plans downstream, so it's
  worth the extra tokens to ground it properly. Unlike `/my-plan`'s recon step, do not force this
  down to Quick or add a restrictive boundary list.

### 3a. Optional Jira granularity calibration

If the user has pointed at one or more reference Jira epics for this feature (or asks how
finely to split it into plans), follow the "Jira calibration" section of
[`references/plan-boundary-spine.md`](references/plan-boundary-spine.md): pull each epic's child
stories via `acli`, classify each against the 10-point spine, and record the resulting table for
step 6 to write into `context.md` under `## Granularity calibration`. Skip this step entirely if
the user hasn't named a reference epic — do not go looking for one unprompted.

### 4. Cache any URLs the user provided

Same as `/my-plan` step 5, targeting `.features/{name}/references/{slug}.md` instead. Fetch each
URL once, prefix with:

```
---
source: {url}
fetched: {ISO date}
---
```

Pass a short pointer per URL (path + one-line description) to the drafting step in step 6.

### 5. Create the scaffold

```
.features/{name}/
  context.md   ← written in step 6, read by /my-plan when this feature is active
  prd.md
  ard.md
  references/  ← cached URL fetches from step 4, if any
```

Point the active-feature symlink at it: `ln -sfn .features/{name} .feature`. `/my-plan` reads
this symlink (if present) when drafting a new plan, so plans created while a feature is active
inherit its context automatically. `plans.md` is not part of this scaffold — `/my-plan` creates
it lazily the first time a plan is made under this feature.

### 6. Draft the documents

Follow [`references/drafting.md`](references/drafting.md) — dispatch to an isolated subagent if
you want drafting kept uncontaminated by exploration reasoning, otherwise perform it directly.
Use:

- The user's original prompt.
- The inferred feature name.
- The recon findings from step 3, verbatim.
- Any cached reference pointers from step 4.
- The Jira granularity-calibration table from step 3a, if one was produced.

Drafting returns three content blocks (`context.md`, `prd.md`, `ard.md`) already self-reviewed.
Write each to its path under `.features/{name}/` exactly as returned. Do not write or touch
`plans.md` here under any circumstance — not even an empty stub, and never rows for
pre-existing/adjacent `.plans/` dirs recon happens to notice. Those go in `context.md`'s
`## Pre-existing plans` section as prose (see `references/drafting.md`), never in `plans.md`.

### 7. Stop and hand back

Tell the user:

- The path: `.features/{name}/` (now active — `.feature` symlink points at it).
- A brief summary of what was drafted.
- Any open questions surfaced in `ard.md`'s Implementation Notes.
- Next step: **hand-edit `prd.md`/`ard.md` first** — rough draft, not a finished spec. Then run
  `/my-review-feature {name}` to grill through the open questions and flip `_Status_` to
  `reviewed`. After that, `/my-plan {first slice of work}` — while `.feature` is active,
  `/my-plan` auto-picks up this context, tags the new plan's `context.md` with
  `parent_feature: {name}`, and creates or appends to `.features/{name}/plans.md`.
- To work on a different feature later, either re-run `/my-feature` or manually repoint the
  symlink: `ln -sfn .features/{other-name} .feature`.

## Output format

- Written: `.features/{name}/{context,prd,ard}.md`
- Reported: summary, open questions, next step (see step 7)

## Anti-patterns to avoid

- Don't write a `checklist.md` — that's a plan-level implementation-readiness gate.
- Don't drop to plan-level detail (data contracts, file-by-file breakdowns) in `ard.md` — that's
  what the plans this epic spawns are for.
- Don't silently overwrite an existing `.features/{name}/`; always guard via `ask_user`.
- Don't add a scope-check redirect step; invoking this skill is itself the size signal.
- Don't write `plans.md` at all, not even empty — `/my-plan` is the only skill that ever writes
  it, lazily, the first time a real plan is created under this feature. Writing it here (even a
  stub, even rows for pre-existing `.plans/` dirs recon notices) is wasted, error-prone work: the
  breakdown will change once you hand-edit and `/my-review-feature` grills it, and `plans.md`
  should only ever reflect plans that actually exist.
- Don't apply spine points 2–10 (presentation scaffold, domain, write path, read path, UI,
  policy, rule follow-ons, cross-cutting, QE gate) as slices *within* a single plan — that
  mechanic is retired. Each spine point produced here becomes its own whole plan.

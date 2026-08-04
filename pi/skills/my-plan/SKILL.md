---
name: my-plan
description: >
  Draft PRD/ARD plan files from a prompt. Use this skill when the user says "plan", wants a
  new feature plan, or needs a fresh .plans/{name}/ scaffold. Recommends redirecting to
  my-quick-plan if the prompt turns out to be small scoped work. Do NOT use for small scoped
  work (my-quick-plan), existing-plan follow-ups/review (my-follow-up-plan, my-review-plan), or
  task breakdown (my-plan-to-tasks).
version: 1.0.1
---

# /my-plan

Create a new plan for a feature or piece of work.

The output is a rough draft, not a finished spec — a cheap-to-read, cheap-to-edit `ard.md`/`prd.md` the human is expected to open and change by hand (rename files, fix data contracts, drop in notes) before `/my-review-plan` runs. Bias toward terse and editable over complete and polished.

## When to use

The user provides a free-text prompt describing what they want to build. Do not require a feature name — infer one.

- Use for creating a brand-new `.plans/{name}/` plan with `context.md`, `prd.md`, `ard.md`, and `checklist.md`.

## When NOT to use

- For work too small to justify a `.plans/{name}/` directory, a PRD, and an ARD, use `my-quick-plan`.
- If `.plans/{name}/` already exists, use `my-follow-up-plan` instead of overwriting.
- To stress-test or refine an existing drafted plan, use `my-review-plan`.
- To break a reviewed plan into tasks, use `my-plan-to-tasks`.

## Process

This skill is an orchestrator, not a drafter: it gathers inputs, runs the recon and drafting steps (ideally as isolated subagents/background tasks, falling back to doing them directly in this session if you want them in-context), and persists what comes back. It does not explore the codebase or write PRD/ARD prose itself — [`references/recon.md`](references/recon.md) and [`references/drafting.md`](references/drafting.md) do, each with their own bounded scope.

### 0. Scope check — small work belongs in `my-quick-plan`

Before inferring a feature name, judge whether the prompt is actually small enough that a persisted `.plans/{name}/` directory, PRD, and ARD are overkill: touches one or a handful of files, no new architecture or data-model decision, no cross-module/cross-team coordination, low ambiguity even before any clarifying questions.

If it looks that small, ask via `ask_user` before doing anything else:

> "This looks small enough to grill and implement directly — want me to switch to `/my-quick-plan` instead of drafting a full PRD/ARD?"
> `**Recommended:** {/my-quick-plan|full plan} — {one-sentence reason grounded in the prompt}`

If the user picks `/my-quick-plan`: tell them to run it with their original prompt — don't run it for them, since it has its own invocation flow. Stop here.

If the user picks the full plan, or the prompt is clearly not small (multi-module, new abstraction, needs a written record): continue to step 1.

### 1. Infer the feature name

Derive a short, lowercase kebab-case name from the prompt (e.g. `"sync students from Wonde"` → `wonde-sync`). Show the inferred name to the user and proceed — don't ask for confirmation unless it's genuinely ambiguous.

### 2. Check for an existing plan

If `.plans/{name}/` already exists, tell the user and point them at the `my-follow-up-plan` skill instead of overwriting — it handles both updating the existing plan in place and starting a new plan seeded with the old one's context. Stop here.

### 3. Recon: high-level only

Follow [`references/recon.md`](references/recon.md) for the recon step — dispatch it to an isolated subagent (e.g. the generic `worker` agent via the `subagent` tool) if you want a clean context, otherwise perform it directly yourself. Either way, use:

- The user's original prompt.
- Explicit thoroughness: **Quick** — targeted lookups, key files only.
- An explicit boundary list, since the recon contract defaults to code-level detail and this step must stay high-level:
  - Read `CONTEXT.md` if it exists (one look, skip if missing).
  - Read `docs/adr/` only if it exists.
  - List top-level app modules/directories once to understand shape.
  - If a specific module looks relevant, list it once at top level only — do not drill into subdirectories.
  - Do not read source files, scan controllers, inspect schemas, or make API inferences.
  - Total exploration: 2–3 lookups max.

The recon step returns its usual structured findings (files retrieved, key code/notes, architecture, start-here pointer) — treat that as recon input for step 4, not as the plan itself.

### 4. Cache any URLs the user provided

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

Pass a short pointer per URL (path + one-line description, not the full text) to the drafting step in step 6, so it can cite the cached file instead of the raw URL.

### 5. Create the scaffold

```
.plans/{name}/
  context.md   ← written in step 6, read by all downstream skills
  prd.md
  ard.md
  checklist.md ← spec-quality checklist, written in step 6
  references/  ← cached URL fetches from step 4, if any
  tasks/       ← empty for now, created by /my-plan-to-tasks
```

### 6. Draft the documents

Follow [`references/drafting.md`](references/drafting.md) for the drafting step — dispatch it to an isolated subagent (e.g. the generic `worker` agent via the `subagent` tool) if you want drafting kept uncontaminated by exploration reasoning, otherwise perform it directly yourself. Either way, use:

- The user's original prompt.
- The inferred feature name.
- The recon findings from step 3, verbatim.
- Any cached reference pointers from step 4 (path + one-line description per URL).

The drafting step returns four content blocks (`context.md`, `prd.md`, `ard.md`, `checklist.md`) already self-reviewed against its own placeholder/consistency/data-contracts/success-criteria scan, plus a one-line note on any checklist items it left unchecked and why.

Write each returned block to its path under `.plans/{name}/` exactly as returned — this skill does not edit the drafted prose, only persists it.

If drafting surfaces a new domain term that needs pinning down, or a hard-to-reverse decision worth recording separately, tell the user to run the `my-domain-modeling` skill rather than trying to fold that material back into the PRD/ARD yourself.

### 7. Stop and hand back

Once all four files are written, tell the user:

- The path to the plan: `.plans/{name}/`
- A brief summary of what was drafted (from the returned `prd.md`/`ard.md` content)
- Any items left unchecked in `checklist.md`, and why (from the drafting step's closing note)
- Any open questions surfaced in `ard.md`'s Implementation Notes (Open Questions bullet)
- Next step: **go review and hand-edit `prd.md`/`ard.md` first** (rename files, fix data contracts, drop in notes) — they're a terse rough draft, not a finished spec. Then run `/my-review-plan {name}` to stress-test.

## Output format

- Written: `.plans/{name}/{context,prd,ard,checklist}.md`
- Reported: summary, unchecked checklist items + why, open questions, next step (see step 7)

## Anti-patterns to avoid

- Don't ask the user for a feature name if it can be inferred from the prompt.
- Don't overwrite an existing `.plans/{name}/`; hand off to `my-follow-up-plan`.
- Don't let recon drift into source-file reading, schema inspection, controller scanning, or API inference; this step stays high-level only.
- Don't edit the drafted prose yourself; write each returned block to its path exactly as returned.

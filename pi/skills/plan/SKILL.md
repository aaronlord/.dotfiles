---
name: plan
description: Create rough draft of PRD and ARD from user prompt with only high-level codebase context. Avoid deep exploration.
---

# /plan

Create a new plan for a feature or piece of work.

## Invocation

The user provides a free-text prompt describing what they want to build. Do not require a feature name — infer one.

## Process

This skill is an orchestrator, not a drafter: it gathers inputs, dispatches recon and drafting to dedicated specialists, and persists what comes back. It does not explore the codebase or write PRD/ARD prose itself — `scout` and `spec-drafter` do, each with their own bounded scope baked into their agent file.

### 1. Infer the feature name

Derive a short, lowercase kebab-case name from the prompt (e.g. `"sync students from Wonde"` → `wonde-sync`). Show the inferred name to the user and proceed — don't ask for confirmation unless it's genuinely ambiguous.

### 2. Check for an existing plan

If `.plans/{name}/` already exists, tell the user and offer to open the existing ARD instead of overwriting. Stop here if they say yes.

### 3. Dispatch a scout for high-level recon only

Dispatch the `scout` subagent with:

- The user's original prompt.
- Explicit thoroughness: **Quick** — targeted lookups, key files only.
- An explicit boundary list, since scout defaults to code-level recon and this step must stay high-level:
  - Read `CONTEXT.md` if it exists (one look, skip if missing).
  - Read `docs/adr/` only if it exists.
  - List top-level app modules/directories once to understand shape.
  - If a specific module looks relevant, list it once at top level only — do not drill into subdirectories.
  - Do not read source files, scan controllers, inspect schemas, or make API inferences.
  - Total exploration: 2–3 lookups max.

Scout returns its usual structured findings (files retrieved, key code/notes, architecture, start-here pointer) — treat that as recon input for step 4, not as the plan itself.

### 4. Cache any URLs the user provided

If the user's prompt includes one or more URLs, fetch each one **once** and cache it locally instead of re-fetching it in every later phase (`/review-plan`, `/plan-to-tasks`, `/implement-tasks` all reuse the cache).

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

Pass a short pointer per URL (path + one-line description, not the full text) to `spec-drafter` in step 6, so it can cite the cached file instead of the raw URL.

### 5. Create the scaffold

```
.plans/{name}/
  context.md   ← written in step 6, read by all downstream skills
  prd.md
  ard.md
  checklist.md ← spec-quality checklist, written in step 6
  references/  ← cached URL fetches from step 4, if any
  tasks/       ← empty for now, created by /plan-to-tasks
```

### 6. Dispatch spec-drafter to draft the documents

Dispatch the `spec-drafter` subagent with:

- The user's original prompt.
- The inferred feature name.
- The scout's findings from step 3, verbatim.
- Any cached reference pointers from step 4 (path + one-line description per URL).

`spec-drafter` returns four content blocks (`context.md`, `prd.md`, `ard.md`, `checklist.md`) already self-reviewed against its own placeholder/consistency/data-contracts/success-criteria scan, plus a one-line note on any checklist items it left unchecked and why.

Write each returned block to its path under `.plans/{name}/` exactly as returned — this skill does not edit spec-drafter's prose, only persists it.

If drafting surfaces a new domain term that needs pinning down, or a hard-to-reverse decision worth recording separately, tell the user to run the `domain-modeling` skill rather than trying to fold that material back into the PRD/ARD yourself.

### 7. Stop and hand back

Once all four files are written, tell the user:

- The path to the plan: `.plans/{name}/`
- A brief summary of what was drafted (from the returned `prd.md`/`ard.md` content)
- Any items left unchecked in `checklist.md`, and why (from spec-drafter's closing note)
- Any open questions surfaced in `ard.md`'s Open Questions section
- Next step: run `/review-plan {name}` to stress-test, or `/plan-to-tasks {name}` to break into tasks

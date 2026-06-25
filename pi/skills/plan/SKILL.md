---
name: plan
description: Create rough draft of PRD and ARD from user prompt with only high-level codebase context. Avoid deep exploration.
---

# /plan

Create a new plan for a feature or piece of work.

## Invocation

The user provides a free-text prompt describing what they want to build. Do not require a feature name — infer one.

## Process

### 1. Infer the feature name

Derive a short, lowercase kebab-case name from the prompt (e.g. `"sync students from Wonde"` → `wonde-sync`). Show the inferred name to the user and proceed — don't ask for confirmation unless it's genuinely ambiguous.

### 2. Check for an existing plan

If `.plans/{name}/` already exists, tell the user and offer to open the existing ARD instead of overwriting. Stop here if they say yes.

### 3. Minimal codebase exploration (high-level only)

This skill should not do deep codebase exploration. The goal is a rough first draft with gaps — not a complete analysis. Stop after one or two quick lookups.

Exploration boundaries:
- Read `CONTEXT.md` if it exists (one look, move on if missing).
- Read `docs/adr/` only if it exists.
- List top-level app modules or directories once to understand shape.
- If a specific module is relevant, list it once at top level only. Do not drill into subdirectories.
- Do not read source files, scan controllers, inspect schemas, or make API inferences.
- Total exploration: 2–3 bash commands max.

Leave blanks instead of inferring:
- If you don't know whether a feature goes in Module X or Y, write both as alternatives in the ARD and ask the user.
- If you don't know the exact command/handler names or schema shape, write placeholders (`{UserPasswordCommand}`, `{password_reset_table}`, etc.) and leave them as open questions.
- If prior art is not immediately obvious, skip it.

If planning surfaces a new domain term that needs pinning down or a hard-to-reverse decision worth recording, use the `domain-modeling` skill rather than burying that material inside PRD/ARD.

### 4. Create the scaffold

```
.plans/{name}/
  context.md   ← written now, read by all downstream skills
  prd.md
  ard.md
  tasks/                ← empty for now, created by /plan-to-tasks
```

### 4a. Write context.md (concise)

Write `.plans/{name}/context.md` with just enough high-level context for downstream skills to understand the domain and where the new feature will live. Keep concise:

- Short list of relevant modules and one-line notes.
- Any ADRs or glossary entries that matter.
- Surface important conventions only if they affect design (naming patterns, layering, major interfaces).

Goal: downstream skills should not need to re-explore, but they can perform deeper exploration later if needed.

### 5. Draft the PRD

Use the template below. Populate it from the user's prompt and the high-level context. Be concrete where possible — reference real module names, actors, and domain terms from project when they are obvious.

<prd-template>
# PRD: {Feature Name}

_Status: draft_

## Problem Statement

What problem is the user (or system) facing? Written from the user's perspective, not the engineer's.

## Solution

What we are building to solve the problem. High-level, from the user's perspective.

## User Stories

A numbered list. Cover all meaningful actors and scenarios, including edge cases.

1. As a {actor}, I want {feature}, so that {benefit}.

## Out of Scope

What this feature explicitly does not include.

## Further Notes

Any open product questions, dependencies on other teams, or links to external context.
</prd-template>

### 6. Draft the ARD

Use the template below. This is the engineering document — be specific about modules, layers, and design decisions, but only to the degree supported by the high-level context. Rough sketches, command/handler names, job structures, open questions are fine.

<ard-template>
# ARD: {Feature Name}

_Status: draft_

## Design Notes

High-level notes on how this will work. Include alternatives you're considering, constraints you've identified, and anything that shapes the approach.

## Code Structure

Sketch the module structure. Use the project's DDD/Hexagonal/CQRS conventions. Name commands, handlers, jobs, repositories, aggregates, interfaces as specifically as you can. Rough is fine — the point is to make the shape concrete.

```
Module/
  Application/
    Commands/
    DTOs/
    Repositories/
  Domain/
    Aggregates/
  Infrastructure/
    Jobs/
    Repositories/
  Presentation/
```

## Implementation Decisions

Key decisions already made. Include:
- Module boundaries
- Interface shapes
- Schema changes
- API contracts
- Relevant ADRs

## Testing Decisions

- What the tests will assert (behaviour through the interface, not internals)
- Which seams are the test boundaries
- Prior art in the codebase

## Open Questions

Things that need to be resolved before or during implementation. These are the starting point for /review-plan.

## Out of Scope

What this ARD explicitly does not cover.

## References

File references added via `<leader>ai` in nvim. Each entry is a `### @path/to/file` heading followed by your notes on how that file relates to this feature.
</ard-template>

### 7. Stop and hand back

Once both documents are written, tell the user:

- The path to the plan: `.plans/{name}/`
- A brief summary of what you drafted
- Any open questions you surfaced
- Next step: run `/review-plan {name}` to stress-test, or `/plan-to-tasks {name}` to break into tasks

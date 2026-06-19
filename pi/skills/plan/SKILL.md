---
name: plan
description: Scaffold a new plan — explore the codebase, infer a feature name from the prompt, then draft both a PRD and ARD in .plans/{name}/. Stop after drafting so the user can review before running /review-plan.
disable-model-invocation: true
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

### 3. Explore the codebase

Before drafting anything, explore the codebase to understand:

- Which modules are relevant (list `app/` or equivalent)
- Any existing patterns, conventions, or ADRs that apply
- What already exists that the feature might touch or extend
- Any prior art (similar features, related migrations, existing interfaces)

Reference what you find in both documents.

### 4. Create the scaffold

```
.plans/{name}/
  context.md   ← written now, read by all downstream skills
  prd.md
  ard.md
  tasks/                ← empty for now, created by /groom-plan
```

### 4a. Write context.md

Before drafting the documents, write `.plans/{name}/context.md` with everything you discovered during exploration. This file is the single source of codebase context for all downstream skills (`/review-plan`, `/groom-plan`, `/implement-tasks`) — they will read it instead of re-exploring.

Include as much detail as the agent judges necessary to make re-exploration unnecessary:
- For simple references, a file path and a one-line note is enough
- For important modules with non-obvious patterns or conventions, include more detail (key classes, interfaces, naming patterns, layering decisions)
- Cover: relevant modules, existing patterns, ADRs, prior art, anything the feature will touch or extend

Format: use headings and bullet lists. Be practical — the goal is that a downstream skill reading only this file has everything it needs.

### 5. Draft the PRD

Use the template below. Populate it from the user's prompt and your codebase exploration. Be concrete — reference real module names, actors, and domain terms from the project.

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

Use the template below. This is the engineering document — be specific about modules, layers, and design decisions. Reference the wonde.md style: rough sketches, command/handler names, job structures, open questions are all fine. The goal is to capture your current thinking clearly enough for a productive /review-plan session.

<ard-template>
# ARD: {Feature Name}

_Status: draft_

## Design Notes

High-level notes on how this will work. Think out loud — include alternatives you're considering, constraints you've identified, and anything that shapes the approach.

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
- Next step: run `/review-plan {name}` to stress-test the design

---
name: review-plan
description: Stress-test the current plan's PRD and ARD using a grill-me interview. Read both documents, identify gaps and ambiguities, interview the user relentlessly until reaching shared understanding, then update both documents in place. Use when the user wants to review or refine a plan before grooming it into tasks.
---

# /review-plan

Stress-test and refine an existing plan through a focused interview, then update the documents to reflect the shared understanding reached.

## Invocation

The user passes the plan name (matching the directory under `.plans/`). If no name is given, list the available plans and ask which one to review.

## Process

### 1. Load the plan

Read both `.plans/{name}/prd.md` and `.plans/{name}/ard.md` in full.

### 2. Load codebase context

Read `.plans/{name}/context.md`. This was written during `/plan` and contains all codebase exploration findings. Do not re-explore — trust this file. Only read additional source files if the plan references something not covered there.

If `context.md` has a `## Reference Documents` section, treat those `.plans/{name}/references/*.md` files as the source for anything the interview needs from that external URL — read the cached file, do not re-fetch the URL. If the interview surfaces a new URL not already cached, fetch it once, save it to `.plans/{name}/references/{slug}.md` with the same `source`/`fetched` frontmatter used during `/plan`, and append it to `context.md`'s `## Reference Documents` section so later phases reuse it too.

### 3. Scan the plan against a fixed taxonomy

Before starting the interview, go through this exact list of categories. For each one, mark it `Clear`, `Partial`, or `Missing` based on what the PRD and ARD currently say. Do not skip a category because it seems unlikely to apply — mark it `Clear` if it clearly doesn't apply, but check it explicitly.

- **Functional scope**: every actor and scenario from the PRD's User Stories has a corresponding design decision in the ARD; edge cases are named, not implied
- **Data contracts**: every DTO, command payload, event, or API request/response shape in the ARD's "Data Contracts" section has every property named with a concrete type (no placeholder rows, no `TBD` types)
- **Domain & data model**: entities, attributes, relationships, and schema changes are named concretely (no `{placeholder}` left unresolved)
- **Interface contracts**: command/handler/job/repository names are concrete; input/output shapes are stated
- **Non-functional behavior**: error handling, validation, and failure modes are addressed for each user story
- **Integration & dependencies**: external services, other teams, or other modules this touches are named
- **Testing boundaries**: the ARD's Testing Decisions section names the test seams and prior art
- **Terminology**: domain terms used in the PRD and ARD match CONTEXT.md's glossary (if one exists) and match each other
- **Open questions**: every item in the ARD's Open Questions section is a real, answerable question, not a vague statement

Every category marked `Partial` or `Missing` becomes at least one interview question. Prioritise `Missing` over `Partial`, and within those, resolve in this order: functional scope > data contracts > domain & data model > interface contracts > non-functional behavior > integration & dependencies > testing boundaries > terminology > open questions.

Data contracts are resolved early and field-by-field: for each DTO/payload with a placeholder row or missing property, ask the user for the exact property name and type before moving to other categories. Do not accept a vague answer ("an object with the usual fields") — press for the concrete list.

### 4. Interview the user — one question at a time

Follow the grill-me approach: interview relentlessly about every aspect of the plan until you reach shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one-by-one. Asking many questions is correct and expected — never shorten or cap the interview to save turns.

Rules:
- Ask exactly **one question at a time**
- If a question can be answered by exploring the codebase, do that instead of asking
- Don't move to the next question until the current one is resolved
- Don't stop early — exhaust every meaningful open question before concluding

**Every question must use this exact structure, in this exact order:**

1. The question itself, stated as a single sentence.
2. Your recommendation, on its own line, in this exact format: `**Recommended:** {answer} — {one-sentence reason}`
3. If you genuinely have no reasonable default, write `**Recommended:** none — {why no default exists}` instead of omitting the line.

Never skip step 2. Never phrase the recommendation as optional or bury it after the question text — it must always appear immediately after the question, before you wait for the user's answer.

### 5. Capture durable artifacts as you grill

A grill that only updates the plan files loses its insights the moment the plan is archived. As terms get sharpened and decisions get made, use the `domain-modeling` skill to write them somewhere durable:

- Resolved or sharpened **domain terms** → the project glossary (`CONTEXT.md`)
- **Hard-to-reverse, surprising, real-trade-off** decisions → an ADR in `docs/adr/`

Capture these inline during the interview, not in a batch at the end. Apply `domain-modeling`'s ADR bar — most decisions don't warrant one.

### 6. Update the plan documents in place

Once the interview is complete, rewrite both `prd.md` and `ard.md` to reflect the shared understanding:

- Update _Status_ from `draft` to `reviewed`
- Fill in gaps identified during the interview
- Replace ambiguous language with precise decisions
- Replace every placeholder row in "Data Contracts" with the confirmed property names and types
- Clear out any Open Questions that were resolved (or note the resolution inline)
- Keep the user's original intent — don't over-engineer or change the scope

Write the updated documents back to `.plans/{name}/prd.md` and `.plans/{name}/ard.md`.

### 7. Wrap up

Tell the user:

- What changed in each document
- Any glossary terms or ADRs captured (with paths)
- Any questions that remain open (and why)
- Next step: run `/plan-to-tasks {name}` to break the ARD into tasks

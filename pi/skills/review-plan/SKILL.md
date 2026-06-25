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

### 3. Identify gaps and ambiguities

Before starting the interview, build a mental list of:

- **Gaps**: things the documents don't address but need to (missing error handling, unspecified dependencies, unclear ownership)
- **Ambiguities**: things that could be interpreted more than one way
- **Risks**: design choices that might cause problems (coupling, missing seam, scalability concern)
- **Open Questions**: anything explicitly marked as open in the ARD

Prioritise these — resolve the most load-bearing decisions first.

### 4. Interview the user — one question at a time

Follow the grill-me approach: interview relentlessly about every aspect of the plan until you reach shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one-by-one.

Rules:
- Ask exactly **one question at a time**
- Provide your **recommended answer** with each question
- If a question can be answered by exploring the codebase, do that instead of asking
- Don't move to the next question until the current one is resolved
- Don't stop early — exhaust every meaningful open question before concluding

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
- Clear out any Open Questions that were resolved (or note the resolution inline)
- Keep the user's original intent — don't over-engineer or change the scope

Write the updated documents back to `.plans/{name}/prd.md` and `.plans/{name}/ard.md`.

### 7. Wrap up

Tell the user:

- What changed in each document
- Any glossary terms or ADRs captured (with paths)
- Any questions that remain open (and why)
- Next step: run `/plan-to-tasks {name}` to break the ARD into tasks

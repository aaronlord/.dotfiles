---
name: my-grill-me
description: >
  Grill the user relentlessly about a plan or design, one question at a time, until reaching
  shared understanding, with a recommended answer for each question. Use this skill when the
  user says "grill me", "interview me relentlessly", "stress-test this plan", or wants to
  deeply validate a strategy. Do NOT use inside my-review-plan or my-quick-plan; those skills
  already embed the grill-me flow.
version: 1.0.0
---

## When to use

- The user wants to get grilled on a plan or design.
- The user asks to "grill me", "interview me relentlessly", or "stress-test this plan".
- The goal is to reach shared understanding by resolving each branch of the decision tree.

## When NOT to use

- Do not invoke this directly from `my-review-plan`; that skill already embeds this approach in its own flow.
- Do not invoke this directly from `my-quick-plan`; that skill already embeds this approach in its own flow.

## Workflow

1. Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.
2. Ask the questions one at a time.
3. If a question can be answered by exploring the codebase, explore the codebase instead.

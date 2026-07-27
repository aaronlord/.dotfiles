---
name: my-domain-modeling
description: >
  Sharpen a project's domain model and record glossary terms or ADR-worthy decisions. Use this
  skill when the user wants to pin down domain terminology, define boundaries, or record a
  trade-off. Do NOT use when you're only reading CONTEXT.md for vocabulary without changing
  the model.
version: 1.0.0
---

# Domain Modeling

## When to use

Actively build and sharpen the project's domain model as you design — challenging terms,
inventing edge-case scenarios, and writing the glossary and decisions down the moment they
crystallise.

## When NOT to use

Merely _reading_ `CONTEXT.md` for vocabulary is not this skill — that's a one-line habit any
skill can do. This skill is for when you're changing the model, not just consuming it.

## Workflow

1. **Keep the file structure repo-root only.**

   Always root-level only:

   ```
   /
   ├── CONTEXT.md
   ├── docs/
   │   └── adr/
   │       ├── 0001-event-sourced-orders.md
   │       └── 0002-postgres-for-write-model.md
   └── app/
   ```

   Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one at the repo root when the first term is resolved. If no `docs/adr/` exists, create it at the repo root when the first ADR is needed.

2. **Challenge against the glossary.**

   When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

3. **Sharpen fuzzy language.**

   When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

4. **Discuss concrete scenarios.**

   When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

5. **Cross-reference with code.**

   When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

6. **Update `CONTEXT.md` inline.**

   When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [references/CONTEXT-FORMAT.md](references/CONTEXT-FORMAT.md).

7. **Offer ADRs sparingly.**

   Only offer to create an ADR when all three are true:

   1. **Hard to reverse** — the cost of changing your mind later is meaningful
   2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
   3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

## Output format

- `CONTEXT.md` should be totally devoid of implementation details. Do not treat it as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.
- Use the format in [references/CONTEXT-FORMAT.md](references/CONTEXT-FORMAT.md) for `CONTEXT.md`.
- Use the format in [references/ADR-FORMAT.md](references/ADR-FORMAT.md) for ADRs.

## Anti-patterns to avoid

- Never create per-module `CONTEXT.md` or `docs/adr/` directories.
- If any of the three ADR criteria is missing, skip the ADR.

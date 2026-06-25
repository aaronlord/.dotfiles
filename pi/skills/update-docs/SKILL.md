---
name: update-docs
description: Update project documentation to reflect recent changes or a specific convention/pattern. Reads relevant code and commits, then updates the right doc — AGENTS.md, CONTEXT.md, docs/adr/, or docs/**. Use when the user invokes /update-docs with a topic hint, or when a review flags documentation drift.
---

# /update-docs

Keep project documentation in sync with how the codebase actually works.

## Invocation

```
/update-docs {topic hint}
```

Examples:
- `/update-docs how we write command handlers`
- `/update-docs the new tenant scoping convention`
- `/update-docs ADR for switching to Vite`

If no hint is given, ask: _"What changed, or what do you want to document?"_

## Process

### 1. Understand the topic

Parse the hint into a subject. If it references a recent change, read the last several commits on the current branch:

```bash
git log --oneline -20
git diff HEAD~5..HEAD -- <relevant paths>
```

If it references a convention or pattern (not a specific commit), search for examples in the codebase:

```bash
rg -l "{keyword}" --type php --type ts
```

Read 2–3 representative examples of the pattern in full. Understand what the actual convention is before touching any doc.

### 2. Identify which doc(s) own this topic

Route the update to the right place:

| What changed | Where to update |
|---|---|
| A project-wide convention, workflow, or command | `AGENTS.md` (root) |
| A domain term, canonical name, or "say X not Y" | `CONTEXT.md` |
| A hard-to-reverse architectural or technical decision | `docs/decisions/` (new ADR) |
| A guide, reference, or how-to for a specific area | `docs/{relevant-file}.md` |
| A path-level convention (e.g. how controllers work in one module) | Path-level `AGENTS.md` in that directory |

When in doubt, prefer `AGENTS.md` over a new `docs/` file — don't create a new file unless the topic is too large to fit naturally as a section.

### 3. Check for conflicts

Before writing, read the target doc(s) in full. Look for:

- Existing sections that cover this topic (update in place, don't duplicate)
- Contradictions with what the code actually does (flag to user before overwriting)
- ADRs that already record the decision (if one exists, update it rather than creating a new one)

If you find a contradiction — the doc says one thing, the code does another — surface it explicitly:

> "`AGENTS.md` line 42 says X, but the code now does Y. I'll update the doc to match. Confirm?"

### 4. Write the update

Make the smallest change that accurately reflects reality:

- Update in place where a section already exists
- Add a new section if the topic is genuinely new
- Use the project's existing vocabulary — read `CONTEXT.md` first so term choices are consistent
- Write for a future agent reading the doc cold, not for the current conversation

For ADRs, follow the ADR format in `docs/decisions/`. Apply the bar from `domain-modeling`: only create an ADR for decisions that are hard-to-reverse, surprising, or involve a real trade-off. Most convention updates don't warrant one.

### 5. Confirm and summarise

Tell the user:

- Which file(s) were updated
- What changed (one line per change)
- Whether any contradictions were found and how they were resolved
- Whether an ADR was created or updated

## Notes

- Never invent conventions. Only document what the code actually does.
- If the codebase is inconsistent (some files follow the pattern, others don't), document what the pattern *should* be and flag the inconsistency to the user.
- This skill documents facts about the codebase — it does not refactor code.
- When updating `AGENTS.md`, be concise. Agents read it on every session; bloat has a real cost.

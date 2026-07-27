---
name: my-update-docs
description: >
  Update project docs to match current code and conventions, or audit AGENTS.md/CONTEXT.md for
  staleness and bloat. Use for "/my-update-docs", doc-drift follow-ups, and periodic doc-sync
  passes. Do NOT use for active domain-model building or terminology-shaping better handled by
  my-domain-modeling.
version: 1.0.0
---

# /my-update-docs

Keep project documentation in sync with how the codebase actually works.

## When to use

Use this skill when the user wants a reactive or periodic documentation sync pass rather than
active model-building.

```text
/my-update-docs {topic hint}
/my-update-docs audit
```

- Use `/my-update-docs {topic hint}` to update documentation for a recent change, convention, or pattern.
- Use `/my-update-docs audit` to run the static-context audit mode.
- Use it when a review flags documentation drift.
- Use it periodically to audit static context for rot.
- If no hint is given and the user didn't ask for an audit, ask: _"What changed, or what do you want to document?"_

## When NOT to use

- Do NOT use this skill to invent conventions; it documents what the code actually does.
- Do NOT use this skill to refactor code.
- Do NOT use this skill for active domain-language shaping, model-building, or deciding the domain framing itself; use `my-domain-modeling` for that work.
- Do NOT use this skill to combine a static-context audit with a topic update in one pass.

## Process

### 0. Context-audit mode (`/my-update-docs audit`)

This mode treats the static-context boundary itself — everything always loaded into every session, per paper: `AGENTS.md` (root and path-level) and `CONTEXT.md` — as a first-class artifact to review, not just a place other topics get written to. Run this instead of steps 1–5, then stop; don't combine an audit with a topic update in one pass.

1. **Read every static-context file in scope**: root `AGENTS.md`, every path-level `AGENTS.md`, `CONTEXT.md`. Note each file's line count.
2. **Check for staleness** — for each rule/section, spot-check it against the actual codebase (grep for the pattern, command, or convention it describes). A rule describing something the code no longer does is stale.
3. **Check for dead references** — any file path, command, or doc link the text names that no longer exists.
4. **Check for duplication/contradiction** — the same rule stated in both root and a path-level `AGENTS.md` with different wording; two sections that disagree.
5. **Check for misplaced content** — a section that reads like a one-off task instruction or a rarely-needed procedure rather than a durable, every-session-relevant convention. Per the static/dynamic context trade-off: content only relevant to specific tasks belongs in a `skill`, loaded on demand, not in `AGENTS.md`, loaded every session regardless of relevance. Flag these as move-to-skill candidates rather than deleting them outright.
6. **Check for raw bloat** — sections that could state the same constraint in fewer words without losing meaning. Every token here is paid on every session regardless of relevance; verbosity has a real, recurring cost.

Report findings as one table:

```
| file:section | issue | detail | recommendation |
| --- | --- | --- | --- |
| AGENTS.md § Testing | stale | Says "run `phpunit`" but the project migrated to `pest` 3 months ago (see composer.json) | Update to reference `pest` |
| api/AGENTS.md § Auth | duplicate | Root AGENTS.md § Auth already states the same JWT rule, worded differently | Remove from path-level file, keep root as the single source |
| AGENTS.md § Onboarding | misplaced | Describes a one-time repo-setup procedure never needed mid-task | Move to docs/onboarding.md or a setup skill; not every-session-relevant |
| AGENTS.md § Style | bloat | 12-line prose paragraph restating what a 2-line bullet list already covers elsewhere in the same file | Cut to the bullet list version |
```

Close with a line count summary (`AGENTS.md: N lines`, etc.) and ask the user which findings to act on before making any edit — this mode never edits unprompted.

### 1. Understand the topic

Parse the hint into a subject. If it references a recent change, read the last several commits on the current branch:

```bash
git log --oneline -20
git diff HEAD~5..HEAD -- <relevant paths>
```

If it references a convention or pattern (not a specific commit), search for examples in the codebase:

```bash
rg -l "{keyword}"
```

Read 2–3 representative examples of the pattern in full. Understand what the actual convention is before touching any doc.

### 2. Identify which doc(s) own this topic

Route the update to the right place:

| What changed | Where to update |
|---|---|
| A project-wide convention, workflow, or command | `AGENTS.md` (root) |
| A domain term, canonical name, or "say X not Y" | `CONTEXT.md` |
| A hard-to-reverse architectural or technical decision | `docs/adr/` (new ADR) |
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

For ADRs, follow the ADR format in `docs/adr/`. Apply the bar from `my-domain-modeling`: only create an ADR for decisions that are hard-to-reverse, surprising, or involve a real trade-off. Most convention updates don't warrant one.

### 5. Confirm and summarise

Tell the user:

- Which file(s) were updated
- What changed (one line per change)
- Whether any contradictions were found and how they were resolved
- Whether an ADR was created or updated

## Examples

- `/my-update-docs how we write command handlers` → update the owning doc for the current command-handler pattern.
- `/my-update-docs the new tenant scoping convention` → document the current convention where it belongs.
- `/my-update-docs ADR for switching to Vite` → create or update `docs/adr/` if the decision meets the ADR bar.
- `/my-update-docs audit` → produce the findings table and line count summary, then stop and ask which findings to act on.

## Output format

- For `/my-update-docs audit`, output one findings table with `file:section`, `issue`, `detail`, and `recommendation`, then a line count summary, then a request for which findings to act on.
- For topic updates, report which file(s) were updated, what changed, whether contradictions were found and resolved, and whether an ADR was created or updated.

## Anti-patterns to avoid

- Don't invent conventions; only document what the code actually does.
- Don't treat inconsistent code as settled reality without saying so; document what the pattern *should* be and flag the inconsistency to the user.
- Don't duplicate existing sections or create a new `docs/` file when an existing owner doc should be updated in place.
- Don't bloat `AGENTS.md`; agents read it on every session, so unnecessary verbosity has a real cost.
- Don't refactor code under the guise of documentation work.

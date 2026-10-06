---
name: my-fix-notes
description: >
  Fetch unresolved review notes from .pi/review-notes/, plan fixes, work through judgement
  calls via my-grill-me, commit each resolved issue, and mark notes resolved in frontmatter.
  Use when the user says "fix review notes", "address review notes", or "fix notes".
version: 1.0.0
---

# fix-notes

## When to use

- User wants to work through local review notes created from Neovim.
- Trigger phrases include "fix review notes", "address review notes", "fix notes", "process review notes".
- When this skill is invoked, immediately begin the workflow below. Do not ask the user if they want to proceed — start directly.
- Systematically address every unresolved review note in `.pi/review-notes/`.

## When NOT to use

- Do not use for GitHub PR review comments — use `my-fix-pr`.
- Do not use to review a branch or WIP diff before notes exist — use `my-review`.
- If `.pi/review-notes/` does not exist or has no unresolved notes, inform user and stop.

## Workflow

### 1. Discover review notes

Scan `.pi/review-notes/*.md`:
- Read frontmatter of each `.md` file.
- Filter for notes where `resolved` is `false` or missing.
- Parse `file`, `line_start`, `line_end`, `created_at`, note body, and code snippet.

If no unresolved notes exist, tell user and stop.

### 2. Present the plan and get approval

Before modifying any code, output a numbered plan listing every unresolved note:

- Note file and target file/line range (e.g. `src/auth.ts:42-45`)
- One-line summary of what the note asks for
- Proposed fix approach (e.g. "extract helper function", "grill-me: unclear error fallback")
- Classification: **obvious** or **requires judgement**

Then ask the user: _"Does this plan look right? Anything to skip or change before I start?"_

Wait for confirmation via `ask_user`. If user asks to skip or modify any item, update plan accordingly. Do not proceed until user approves.

### 3. Triage each note

For every unresolved note in order:
1. **Read note in full.** Review instruction and referenced snippet.
2. **Locate code in repo.** Read file and surrounding context.
3. **Classify:**
   - **Obvious / mechanical** — typo, missing import, formatting, rename, simple refactor with clear answer.
   - **Requires judgement** — design decisions, architectural tradeoffs, unclear intent.

### 4. Resolve every judgement call

For each note classified **requires judgement**, follow `my-grill-me`:
- Ask user about right approach using `ask_user`, one question at a time, with recommended answer.
- Resolve decision tree before touching code.
- Complete all judgement calls upfront.

### 5. Dispatch fixes

Group notes by target file so no two fixer subagents edit the same file concurrently.

For each file/group, dispatch a `worker` subagent with:
- Target file and code context.
- Exact fix instructions (proposed approach for obvious, agreed approach for judgement calls).

Tier per `model-matrix.md` (all generators for implementation):
- `lightweight/generator` default.
- `versatile/generator` if cross-cutting scope.
- `powerful/generator` if security-adjacent or high-risk.

Show diff of files touching judgement calls to user before staging. Obvious fixes skip manual diff check.

Stage files:
```bash
git add <file(s)>
```

### 6. Commit each resolved issue

Create conventional commit per logical fix:
```bash
git commit -m "fix: <short imperative description of what was fixed>"
```

### 7. Mark notes as resolved

Update frontmatter of processed note files:
- Change `resolved: false` → `resolved: true`.
- Add `resolved_at: <ISO timestamp>`.

### 8. Wrap up

Output summary:
- List each commit and message.
- List updated review note files marked resolved.
- Note any intentionally skipped notes.

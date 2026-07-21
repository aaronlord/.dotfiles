---
name: open-pr
description: Open a pull request for the current branch using the gh CLI. Assigns the user, fills the repo's PR template when one exists, and writes an extremely concise description. Use when the user wants to open, create, or submit a PR.
---

# open-pr

When invoked, start immediately. No need to ask permission first.

Open a PR for the current branch's work with a terse, high-signal description.

## Workflow

### 1. Preconditions

```bash
git status --short
git branch --show-current
```

- If there are uncommitted changes, ask the user whether to commit them first or proceed anyway. Don't assume.
- If on the repo's default branch, stop and tell the user — can't PR from default branch.

Push the branch if it has no upstream or has unpushed commits:

```bash
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
git push -u origin HEAD
```

### 2. Check for an existing PR

```bash
gh pr view --json url,number 2>/dev/null
```

If one already exists for this branch, report its URL and stop — don't open a duplicate.

### 3. Find the PR template

Do **not** use `find` with `-not`/`-prune`/compound predicates — some environments wrap `find` (e.g. `rtk`) and reject those flags, silently failing to locate a template that exists. Check fixed candidate paths directly instead:

```bash
ls .github/pull_request_template.md .github/PULL_REQUEST_TEMPLATE.md \
   .github/PULL_REQUEST_TEMPLATE/*.md \
   docs/pull_request_template.md docs/PULL_REQUEST_TEMPLATE.md \
   PULL_REQUEST_TEMPLATE.md pull_request_template.md 2>/dev/null
```

(Case varies by repo — check both `pull_request_template.md` and `PULL_REQUEST_TEMPLATE.md` at each location.) If `.github/PULL_REQUEST_TEMPLATE/` has multiple files, ask the user which one, or use `default.md` if present.

If found, read it — use its section structure as the body skeleton. If not found, use a minimal fallback:

```markdown
## What

<concise description>
```

### 4. Extract ticket if available

Search for ticket in:

1. Branch name: `git branch --show-current` — look for pattern like `[TICKET-123]` or `ticket-123`
2. Commit messages: `git log --oneline <default-branch>..HEAD` — extract `[TICKET-123]` from end of commit messages

If found, store it for the title in step 5. Use the first occurrence found (prefer branch > commits).

### 5. Gather context for the description

```bash
git log --oneline <default-branch>..HEAD
git diff <default-branch>...HEAD --stat
```

Read the actual diff for anything non-trivial — don't write the description from commit messages alone.

### 6. Write the description

Rules — be strict about these:

- **Describe what happened**, not what you're about to do. Past tense, factual.
- **Only explain "how"** when the approach isn't obvious from the diff/title (e.g. a non-obvious algorithm choice, a workaround for a library limitation, a tradeoff). If the "how" is standard/obvious (e.g. "added a null check", "renamed a function"), omit it entirely.
- No filler: no "This PR...", no restating the title, no changelong prose, no marketing language.
- Fill every template section that applies; if a section doesn't apply, write "N/A" or remove it — don't leave it blank or invent content.
- Prefer bullet points over paragraphs when the template section allows free text.
- Title: **conventional commit style** — `<type>(<scope>): <short imperative summary> [TICKET-123]`, e.g. `fix(auth): resolve race condition in token refresh [AUTH-42]`, `feat(billing): add proration for mid-cycle upgrades [BIL-108]`. Scope is optional, omit if no single scope fits. Ticket (in brackets) goes at the end if available.
  - Check `git log --oneline -20` on the base branch first to confirm the repo actually uses conventional commits and matches its type vocabulary/scope style before applying this.
  - Pick `type` from the commits being merged (`feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`, `build`, `ci`, `style`). If commits mix types, pick the dominant one for the title — don't invent a combined type.
  - Append the ticket from step 4 if found: ` [TICKET-123]` at the end.

### 7. Create the PR

```bash
gh pr create \
  --title "<title>" \
  --body-file <tmpfile> \
  --assignee @me
```

Write the composed body to a temp file first (e.g. `/tmp/pr-body.md`) rather than passing multi-line `--body` inline.

If the repo has no default reviewers/labels configured and the user hasn't asked for any, don't add them — stick to title, body, assignee.

### 8. Report

Print the resulting PR URL. Nothing else needed.

## Notes

- Never fabricate template sections that don't exist in the repo's actual template.
- Never pad the description to look more thorough — concise is the point.
- If the diff is large/multi-purpose, summarize by theme (bullets), not file-by-file.

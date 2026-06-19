---
name: fix-pr
description: Fetch open review comments for the current branch's PR using the gh CLI, address each one by working through it with the user via /grill-me, then commit a fix-style conventional commit per resolved issue. Use when the user wants to work through PR review feedback.
---

# fix-pr

When this skill is invoked, immediately begin the workflow below. Do not ask the user if they want to proceed — just start. The fact that they invoked the skill is consent enough.

Systematically address every open review comment on the current branch's PR.

## Workflow

### 1. Discover the PR and fetch comments

```bash
# Get the PR number and repo slug for the current branch
gh pr view --json number,headRepositoryOwner,headRepository
```

Then fetch inline code review comments via the API (this is the reliable source — `gh pr view --json` does not support a `reviewThreads` field):

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  --jq '[.[] | {id, path, line, body, user: .user.login}]'
```

Treat any comment where `resolved` is `null` or `false` as unresolved. The GitHub API returns `null` for this field on most comments, not `false`.

If there is no open PR for the current branch, tell the user and stop.

### 2. Present the plan and get approval

Before touching any code, output a numbered plan listing every unresolved comment:

- Comment number and file/line
- One-line summary of what the reviewer asked for
- Your proposed fix approach (e.g. "rename `x` → `count`", "extract constant `MAX_RETRIES = 3`", "grill-me: unclear design tradeoff")
- Classification: **obvious** or **requires judgement**

Example:

```
Plan:
1. src/auth.ts:42 — remove unused `logger` import → obvious fix
2. src/user.ts:88 — null check missing in `getUser` → obvious fix
3. src/api.ts:15 — redesign error handling strategy → requires judgement (will grill-me)
```

Then ask the user: _"Does this plan look right? Anything to skip or change before I start?"_

Wait for confirmation. If the user asks to skip or modify any item, update the plan accordingly. Do not proceed until the user approves.

### 3. Triage each comment

For every unresolved review comment, in order:

1. **Read the comment in full.** Understand what the reviewer is asking for.
2. **Locate the relevant code** in the repo. Read the file and surrounding context.
3. **Classify the issue:**
   - **Obvious / mechanical** — typo, formatting, simple rename, missing import, trivial refactor with a clear correct answer. Apply the fix immediately without discussion.
   - **Requires judgement** — design decisions, tradeoffs, unclear intent, non-trivial changes. Invoke `/grill-me` for these.

### 4. For obvious fixes

Apply the fix directly using the edit tool, then stage the file:

```bash
git add <file>
```

Collect all obvious fixes into a **single commit** at the end (or group by logical theme if the fixes are unrelated).

### 5. For non-obvious issues — invoke /grill-me

Load and follow the grill-me skill instructions: interrogate the user about the right approach, one question at a time. Provide your recommended answer for each question. Resolve the decision tree before writing any code.

Once you and the user agree on the approach, implement it.

Stage the changed files:

```bash
git add <file(s)>
```

### 6. Commit each resolved issue

After each logical fix (or group of related fixes), create a conventional commit:

```bash
git commit -m "fix: <short imperative description of what was fixed>"
```

Rules for the commit message:
- Prefix is always `fix:` (lowercase)
- Body is optional but use it when the fix needs more context
- One commit per distinct issue or tightly coupled group of issues
- Message describes **what** was fixed, not the reviewer's comment verbatim

Example messages:
- `fix: remove unused import in auth middleware`
- `fix: rename variable to clarify intent`
- `fix: handle null case in user lookup`
- `fix: extract magic number into named constant`

### 7. Wrap up

After all comments are addressed, summarise what was done:
- List each commit with its message
- Note any comments that were intentionally skipped and why
- Suggest pushing: `git push`

## Notes

- Never commit secrets, credentials, or `.env` files.
- If a review comment is already addressed by existing code, note it and move on.
- If a comment is on a line that no longer exists (stale comment), flag it to the user.
- Prefer small, focused commits over one large "address review feedback" commit.
- Always read the full file context before making a change — don't fix in isolation.

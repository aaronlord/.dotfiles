---
name: my-fix-pr
description: >
  Fetch open PR review comments, plan fixes, work through judgement calls via my-grill-me,
  commit each resolved issue, then resolve addressed threads. Use when the user says fix PR
  review feedback or address review comments. Do NOT use to open a PR (my-open-pr) or review a
  branch before feedback exists (my-review).
version: 1.2.0
---

# fix-pr

## When to use

- User wants to work through PR review feedback.
- Trigger phrases include "fix PR review feedback", "address review comments", and "work through PR comments".
- When this skill is invoked, immediately begin the workflow below. Do not ask the user if they want to proceed — just start. The fact that they invoked the skill is consent enough.
- Systematically address every open review comment on the current branch's PR.

## When NOT to use

- Do not use to open, create, or submit a PR — use `my-open-pr`.
- Do not use to review a branch, WIP diff, or changes since a commit before reviewer feedback exists — use `my-review`.
- If there is no open PR for the current branch, tell the user and stop.

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

### 2. Check the most recent CI run

Fetch the latest CI status for the PR:

```bash
gh pr checks {pr_number} --json name,state,link,workflow
```

- If all checks passed, note that and move on — no CI item to add to the plan.
- If a check **failed**, open its log (`gh run view {run_id} --log-failed`) to find the root cause and add it to the plan as a normal issue.
- If a check was **cancelled** (not failed), a cancelled run usually has no useful log of its own — the real cause is often reported by a bot comment on the PR (e.g. a CI bot posting a failure summary before cancellation kicked in). Fetch issue comments and find the most recent CI-related one:

```bash
gh api repos/{owner}/{repo}/issues/{pr_number}/comments \
  --jq '[.[] | {id, body, user: .user.login, created_at}] | sort_by(.created_at) | reverse'
```

Look for comments from CI bots or ones mentioning test runners, build tools, or failure summaries (e.g. a test-runner failure list, lint output, build error). Use the most recent one that plausibly explains the cancellation as the basis for a plan item.

If neither a failed check nor a CI comment reveals a clear cause, tell the user CI is cancelled/unclear and ask how to proceed.

### 3. Present the plan and get approval

Before touching any code, output a numbered plan listing every unresolved comment and any CI issue found above:

- Comment number and file/line
- One-line summary of what the reviewer asked for
- Your proposed fix approach (e.g. "rename `x` → `count`", "extract constant `MAX_RETRIES = 3`", "grill-me: unclear design tradeoff")
- Classification: **obvious** or **requires judgement**

Then ask the user: _"Does this plan look right? Anything to skip or change before I start?"_

Wait for confirmation. If the user asks to skip or modify any item, update the plan accordingly. Do not proceed until the user approves.

### 4. Triage each comment (and any CI issue)

For every unresolved review comment, and the CI issue if one was found, in order:

1. **Read the comment (or CI failure/bot comment) in full.** Understand what's being asked for or what broke.
2. **Locate the relevant code** in the repo. Read the file and surrounding context.
3. **Classify the issue:**
   - **Obvious / mechanical** — typo, formatting, simple rename, missing import, trivial refactor with a clear correct answer.
   - **Requires judgement** — design decisions, tradeoffs, unclear intent, non-trivial changes.

This step only builds the classified list — don't fix or dispatch anything yet.

### 5. Resolve every judgement call

For each comment classified **requires judgement** in step 4, load and follow the `my-grill-me`
skill instructions: interrogate the user about the right approach, one question at a time, with
your recommended answer for each. Resolve the decision tree before writing any code. Work through
every judgement-call comment this way before moving to step 6 — this stays a conversation with
the user, so it can't be parallelized or delegated, but all of it should happen up front rather
than interleaved one issue at a time with fixing.

By the end of this step, every comment has a known, fully-specified fix approach — the obvious
ones already had one from step 4, and the judgement ones now have whatever was agreed with the
user. Nothing is still ambiguous.

### 6. Dispatch all fixes

Now that every comment has a known fix approach, dispatch the actual edits — don't do this
inline in the main session. Group **all** comments, obvious and judgement-resolved together, by
file: never run two fixer subagents against the same file concurrently, so a file touched by
both an obvious fix and a judgement-resolved fix gets **one** dispatch covering both, not two.

For each file/group, dispatch a `worker` subagent with: the fix approach(es) for that file (the
proposed approach for obvious comments, the agreed approach for judgement ones — not the raw
grill-me transcript), and the relevant code context — not the whole PR or every comment.

Tier per `model-matrix.md`:

- `lightweight/generator` default — covers obvious fixes and most judgement-resolved fixes, since
  by this point the decision is fully specified either way.
- `versatile/generalist` if a group's agreed approach still has real cross-cutting scope.
- `powerful/generalist` if a group's fix is security-adjacent.

Dispatch in parallel across files/groups — this is the payoff of resolving every decision in
step 5 first instead of interleaving grill → dispatch → grill → dispatch one issue at a time.

For any file/group whose dispatch includes a judgement-resolved fix, show the user the resulting
diff and confirm it matches what was agreed before staging — that subagent wasn't part of the
grill-me conversation and can drift from what was agreed even with a clear brief. Groups that are
purely obvious skip this check.

After each dispatch is confirmed (or immediately, for purely-obvious groups), stage the file(s):

```bash
git add <file(s)>
```

### 7. Commit each resolved issue

After each logical fix (or group of related fixes), create a conventional commit:

```bash
git commit -m "fix: <short imperative description of what was fixed>"
```

Rules for the commit message:

- Prefix is always `fix:` (lowercase)
- Body is optional but use it when the fix needs more context
- One commit per distinct issue or tightly coupled group of issues
- If a file's dispatch combined an obvious fix and a judgement-resolved fix, commit it as one
  commit whose message covers both — don't try to split one file's diff across two commits.
- Message describes **what** was fixed, not the reviewer's comment verbatim

### 8. Ask before touching GitHub

All fixes so far are local commits only — nothing has been pushed or resolved on GitHub yet. Ask the user:

> "All fixes are committed locally. Want me to push the branch and resolve the addressed comment threads on GitHub (with a reply on any skipped ones)?"

Wait for confirmation. If the user declines or wants to review the diff first, stop here and summarize per the output format below without pushing or touching threads — they can ask you to do it later.

If the user agrees, continue to step 9.

### 9. Resolve or reply to comment threads, then push

The REST comment IDs from step 1 are not the same as GraphQL review thread IDs — resolving requires the latter. Fetch them once, mapping `databaseId` back to the REST comment `id`:

```bash
gh api graphql -f query='
query {
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {pr_number}) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 1) { nodes { databaseId } }
        }
      }
    }
  }
}'
```

For each comment addressed in step 4–7 (fixed via obvious fix or grill-me), resolve its thread:

```bash
gh api graphql -f query='
mutation($id: ID!) {
  resolveReviewThread(input: {threadId: $id}) {
    thread { id isResolved }
  }
}' -f id="{thread_id}"
```

For any comment the user decided **not** to fix (explicitly skipped, already addressed by existing code, or stale/no-longer-applicable), leave the thread unresolved but post a reply explaining why, so the reviewer has context without needing to re-ask:

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies \
  -f body="This is an AI-generated summary of @{pr_author}'s feedback:

> {explanation of why this was skipped}"
```

Do not resolve a thread you decided not to fix — resolving implies the reviewer's concern is addressed. Only resolve threads for comments actually fixed.

Then push the branch:

```bash
git push
```

### 10. Wrap up

After all comments (and any CI issue) are addressed, summarise what was done using the output format below.

## Examples

### Plan example

```text
Plan:
1. src/auth.ts:42 — remove unused `logger` import → obvious fix
2. src/user.ts:88 — null check missing in `getUser` → obvious fix
3. src/api.ts:15 — redesign error handling strategy → requires judgement (will grill-me)
4. CI: vitest run cancelled — bot comment points to failing `user.test.ts` snapshot → obvious fix
```

### Commit message examples

- `fix: remove unused import in auth middleware`
- `fix: rename variable to clarify intent`
- `fix: handle null case in user lookup`
- `fix: extract magic number into named constant`
- `fix: update stale snapshot causing vitest failure`

## Output format

After all comments (and any CI issue) are addressed, summarise what was done:

- List each commit with its message
- Note any comments that were intentionally skipped and why
- If step 8 was declined: note that GitHub threads are unresolved and the branch is unpushed, and that you're ready to do both whenever asked
- If step 9 ran: confirm which review threads were resolved vs. left open with a reply, and confirm the push succeeded
- Note CI status before/after (e.g. "CI was cancelled due to a test failure, fixed and pushed")

## Anti-patterns to avoid

- Never commit secrets, credentials, or `.env` files.
- If a review comment is already addressed by existing code, note it and move on.
- If a comment is on a line that no longer exists (stale comment), flag it to the user.
- Prefer small, focused commits over one large "address review feedback" commit.
- Always read the full file context before making a change — don't fix in isolation.
- Don't confuse a cancelled run with a passing one — cancelled means unknown/likely-broken, always investigate.
- Resolving a thread and replying to it are independent GitHub actions — a reply doesn't auto-resolve, and resolving doesn't require a reply. Fixed comments get resolved (reply optional); skipped comments get a reply and stay unresolved.
- Do not edit files yourself in the main session for obvious or judgement-resolved fixes — dispatch a sized subagent per file/group via `model-matrix.md`, same as `my-review`'s fix step.
- Do not dispatch two fixer subagents against the same file concurrently — group by file first, merging obvious and judgement-resolved fixes on the same file into one dispatch.
- Do not skip the pre-stage diff check on a file/group whose dispatch includes a judgement-resolved fix — that subagent wasn't part of the interrogation and can drift from what was agreed even with a clear brief.
- Do not interleave grilling and dispatching one issue at a time — resolve every judgement call (step 5) before dispatching any fixes (step 6), so all fixes can go out in one parallel wave and file-grouping can see the whole picture.

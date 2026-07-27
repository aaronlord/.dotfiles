# Ticket source: Jira

Trigger: a Jira ticket (link, key like `TEAM-123`, or "fix TEAM-123").

Uses the `acli` CLI (Atlassian's official CLI — auth via `acli jira auth login --web` or API token, done once per machine). Check auth first if a command fails: `acli jira auth status`.

1. Fetch the ticket: `acli jira workitem view TEAM-123 --json` (or `--fields *all` for everything including custom fields). Extract key from a pasted URL if given one (`.../browse/TEAM-123`).
2. Note the **short issue key** (e.g. `TEAM-123`) — this is what goes in the regression test comment in Phase 5. Don't lose it.
3. Pull description, steps to reproduce, comments (`acli jira workitem comment list TEAM-123 --json`), and attachments (`acli jira workitem attachment` subcommands) — these are your repro ingredients for Phase 1/2. Prefer replaying a captured payload/log attached to the ticket (loop technique #5) over guessing.
4. Once fixed and merged, update the ticket:
   - Comment with the fix: `acli jira workitem comment create --key TEAM-123 --body "Fixed in <commit/PR>"`
   - Transition status if appropriate: `acli jira workitem transition --key TEAM-123 --status "Done" --yes`

## Regression test comment format

```php
// TEAM-123
it('fixes the issue where guest checkout crashes on empty cart', function () {
    ...
});
```

No paragraph explaining the ticket, no pasted description in a comment block — the key is the pointer, the test body is the spec.

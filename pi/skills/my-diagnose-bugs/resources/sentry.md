# Ticket source: Sentry

Trigger: a Sentry issue (link, ID, or "fix SENTRY-XXX").

1. Fetch the issue: `sentry_get_sentry_resource` (by URL) or `sentry_search_issues` to find it, then `sentry_analyze_issue_with_seer` for stack trace / root-cause signal if useful.
2. Note the **short issue ID** (e.g. `PROJECT-9E`) — this is what goes in the regression test comment in Phase 5. Don't lose it.
3. Pull stack trace, breadcrumbs, request payload, user context, tags — these are your repro ingredients for Phase 1/2. Prefer replaying the captured payload/event (loop technique #5) over guessing.
4. Once fixed and merged, update the issue with `sentry_update_issue` (resolve, or comment with the fix commit).

## Regression test comment format

```php
// PROJECT-9E
it('fixes the issue where guest checkout crashes on empty cart', function () {
    ...
});
```

No paragraph explaining the issue, no pasted stack trace in a comment block — the ID is the pointer, the test body is the spec.

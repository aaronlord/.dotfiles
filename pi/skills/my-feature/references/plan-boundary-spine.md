# Plan-boundary spine

Reference used by `/my-feature` (to draft the Anticipated Plan Breakdown) and
`/my-review-feature` (to check that breakdown holds up) for splitting an epic into PR-sized
plans. One plan = one PR under the current `/my-plan-to-tasks` + `/my-implement-tasks` model, so
"how finely should this epic split into plans" and "how finely should a capability split into
PRs" are the same question. Adapted from an earlier, since-reverted attempt to slice a *single
plan* into multiple PRs (`/my-implement-tasks` opening one PR per slice mid-plan) — that mechanic
broke because it hopped branches mid-implementation with no clean stopping point. Applying the
same reasoning one level up avoids that: every split here is a whole separate plan, flowing
through the existing plan → review → tasks → implement pipeline normally, never a mid-plan
branch-hop.

## The PR-worthy test

A plan earns its own PR (i.e. deserves to be its own plan, not folded into a neighbour) when
**all** of:

- It compiles and passes CI on its own.
- It fulfills or stubs a named contract — an aggregate method, a DTO, a route/request, an
  interface — so nothing downstream needs to exist yet for this plan to be correct.
- It is independently reviewable and either independently valuable, or is an intentional
  walking-skeleton stub (see spine point 2).
- Anything it can't finish yet is behind a feature toggle (default off) or satisfied via a
  stub/test-object-mother (`Mother::make()` or equivalent) rather than half-wired.

## The default spine

Apply top-down. Not every feature needs every point — skip what doesn't apply (e.g. no new
domain object needed: skip point 3, cite and reuse the existing aggregate instead of drafting a
plan for it).

1. **Capability boundary.** Test: *"if this ships and the next related capability follows weeks
   later (absent or flag-off), does this still stand alone as valuable?"* An epic often bundles
   several of these (e.g. "list", "create", "edit" are each independently shippable) — each one
   gets its own top-level pass through this spine, not one shared plan.
2. **Presentation scaffold.** Route + controller + request + an empty/stub view, wired
   end-to-end against placeholder data (a hardcoded value or a `Mother::make()` stub). This is
   the walking skeleton: it proves routing/DI/module registration before any real logic exists.
   Often the first plan shipped for a capability — sometimes before the domain work in point 3
   even lands.
3. **Domain/aggregate.** Build it, or — check first — reuse one already built by an earlier
   capability and cite it (e.g. "handler uses the existing `MedicationAdministration`
   aggregate"). Never re-plan a domain concept that already exists.
4. **Write path.** Command handler + write repository/UoW, built against the aggregate's public
   contract.
5. **Read path.** Query + read repository. A separate contract from the write path — its own
   plan even when it reads the same underlying data (CQRS split, not just a layer split).
6. **Real UI.** Swap the point-2 stub view for the actual table/form/modal, now consuming the
   real read path from point 5.
7. **Policy/access control.** Its own plan — cuts across every layer above, reviewed against its
   own rule set rather than folded into whichever layer happens to check it.
8. **Rule/predicate-level follow-ons.** Once the base seam (points 3–6) ships plain, each
   additional independent business rule or derived field/column is its own plan — not a rewrite
   of the base one. Test: *"does this touch the same method again, but reason about it
   independently of rules already shipped?"* If yes, defer it, ship it alone. Trivial ones (a
   single-line predicate, no test complexity) may combine into one plan — same "would a reviewer
   approve one and reject its neighbour" bar tasks already use.
9. **Cross-cutting / edge-case / UX polish.** Its own plan regardless of which layer it happens
   to touch (a timezone edge case, an extra menu link, a "share with X" nice-to-have). Never
   bundle into the vertical plan that triggered it.
10. **QE/acceptance gate.** Terminal plan for the capability — same role a plan's own "Ensure CI
    passes" task plays for that plan's tasks, but scoped to handing the whole capability to QE
    once its plans have shipped.

## Jira calibration (optional)

Don't let the agent free-crawl Jira guessing granularity. If the user points at one or more
reference Jira epics, pull the pattern from them, not their content — **epic ↔ this feature,
story ↔ a plan** (not story ↔ a slice within a plan, as in the earlier reverted version):

```bash
acli jira workitem view {epic-key}
acli jira workitem search --jql "parent = {epic-key}" --fields "key,summary,issuetype,status"
```

For each child story returned, classify it against the 10-point spine above (which point
produced that split). Summarize as a short table — `story key/summary → spine point` — and use
it to calibrate how finely (or coarsely) the Anticipated Plan Breakdown should split this
feature. If the reference epic split every filter into its own story, do the same here. If it
lumped two trivial rules into one story, mirror that too. Record the table under a
`## Granularity calibration` heading in the feature's `context.md`, citing the epic key(s) —
don't copy ticket prose in, just the axis mapping.

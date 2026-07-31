# Slicing spine

Reference used by `/my-plan-to-tasks` (to group tasks into PR-sized slices) and
`/my-implement-tasks` (to open a stacked PR at each slice boundary instead of one PR for the
whole plan). Derived from observed Jira epic/story breakdowns (Veracross MNG project,
`[Medication Schedule]` epic family) cross-checked against this project's layered architecture
(`Presentation` / `Application (Commands, Queries)` / `Domain` / `Infrastructure`).

## The PR-worthy test

A slice earns its own PR when **all** of:

- It compiles and passes CI on its own.
- It fulfills or stubs a named contract — an aggregate method, a DTO, a route/request, an
  interface — so nothing downstream needs to exist yet for this slice to be correct.
- It is independently reviewable and either independently valuable, or is an intentional
  walking-skeleton stub (see spine point 2).
- Anything it can't finish yet is behind a feature toggle (default off) or satisfied via a
  stub/test-object-mother (`Mother::make()` or equivalent) rather than half-wired.

## The default spine

Apply top-down. Not every plan needs every point — skip what doesn't apply (e.g. no new domain
object needed: skip point 3, cite and reuse the existing aggregate instead of re-deriving a
task for it).

1. **Capability boundary.** Decided at `/my-plan` time, not here. Test: *"if this ships and the
   next related capability follows weeks later (absent or flag-off), does this still stand alone
   as valuable?"* If a single plan actually bundles two capabilities that both pass this test
   independently (e.g. "list" and "filtering" are both independently shippable), tell the user to
   split into separate plans before grooming — don't fold both into one plan's slices.
2. **Presentation scaffold.** Route + controller + request + an empty/stub view, wired
   end-to-end against placeholder data (a hardcoded value or a `Mother::make()` stub). This is
   the walking skeleton: it proves routing/DI/module registration before any real logic exists.
   Ships earliest — often before the domain work in point 3 even lands.
3. **Domain/aggregate.** Build it, or — check first — reuse one already built by an earlier
   capability and cite it (e.g. "handler uses the existing `MedicationAdministration`
   aggregate"). Never re-slice a domain concept that already exists.
4. **Write path.** Command handler + write repository/UoW, built against the aggregate's public
   contract.
5. **Read path.** Query + read repository. A separate contract from the write path — slice
   separately even when it reads the same underlying data (CQRS split, not just a layer split).
6. **Real UI.** Swap the point-2 stub view for the actual table/form/modal, now consuming the
   real read path from point 5.
7. **Policy/access control.** Its own slice — cuts across every layer above, reviewed against its
   own rule set rather than folded into whichever layer happens to check it.
8. **Rule/predicate-level follow-ons.** Once the base seam (points 3–6) ships plain, each
   additional independent business rule or derived field/column is its own slice — not a rewrite
   of the base PR. Test: *"does this touch the same method again, but reason about it
   independently of rules already shipped?"* If yes, defer it, ship it alone. Trivial ones (a
   single-line predicate, no test complexity) may combine into one slice — same "would a reviewer
   approve one and reject its neighbour" bar tasks already use.
9. **Cross-cutting / edge-case / UX polish.** Its own slice regardless of which layer it happens
   to touch (a timezone edge case, an extra menu link, a "share with X" nice-to-have). Never
   bundle into the vertical slice that triggered it.
10. **QE/acceptance gate.** Terminal slice for the capability — same role the plan's "Ensure CI
    passes" task already plays for the whole plan, but scoped to this slice.

## Jira calibration (optional)

Don't let the agent free-crawl Jira guessing granularity. If the user points at one or more
reference epics, pull the pattern from them, not their content:

```bash
acli jira workitem view {epic-key}
acli jira workitem search --jql "parent = {epic-key}" --fields "key,summary,issuetype,status"
```

For each child story returned, classify it against the 10-point spine above (which point
produced that split). Summarize as a short table — `story key/summary → spine point` — and use
it to calibrate how finely (or coarsely) to slice the current plan. If the reference epic split
every filter into its own story, do the same here. If it lumped two trivial rules into one story,
mirror that too. Record the table in the plan's `context.md` under a `## Granularity calibration`
heading, citing the epic key(s) — don't copy ticket prose in, just the axis mapping.

## Slice metadata

Each task in `tasks.md` belongs to exactly one slice. A slice is: an ordered subset of tasks,
identified by a spine point (or a rule/edge-case label under point 8/9), that ends in a
shippable state. Track slices in a `## Slices` table in `tasks.md` (see
`/my-plan-to-tasks` step 6) — id, name, spine point, task range, and (once opened) its branch and
PR URL.

## Branch/PR sequencing

Each slice gets its own branch off the (up-to-date) default branch: `{plan-name}/slice-{nn}-{slug}`
(e.g. `medication-schedule-list/slice-02-presentation-scaffold`). Its PR targets the default
branch — same as any normal PR, no explicit base needed.

**One slice, merged, before the next branches.** `/my-implement-tasks` opens exactly one slice's
PR then stops — it does not create the next slice's branch or start its tasks in the same run. A
PR under review may come back with change requests, and the next slice must not be built on code
that might still change. The next slice's branch is only cut once the current slice's PR has
merged; resuming (re-running `/my-implement-tasks`) pulls the updated default branch first.

If [gh-stack](https://github.github.com/gh-stack/) becomes generally available and the team
wants true stacking (branching the next slice before the previous merges), that's a deliberate
future change to this section — not the default today.

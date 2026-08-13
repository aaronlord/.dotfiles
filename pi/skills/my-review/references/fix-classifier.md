# Fix classifier

Assigns a `{weight}/{orientation}` (or flags a finding as unresolved judgment) to a fix, so it
dispatches at the cheapest model tier that can do it correctly — not whatever tier found it.
Duplicated from `/my-plan-to-tasks`'s task-classifier on purpose (skills don't share references);
keep both in sync if the underlying model-matrix framework changes.

Finding a bug and fixing it are different jobs. The review pass already named the exact flaw and,
usually, the exact fix pattern (e.g. "validate the access code via `RedeemCodeHandler` before
save, same as `AccessCodeController`"). Once the approach is spelled out, implementing it is
generator-tier work — the severity of the *finding* (security/critical) is not, by itself, a
reason to dispatch the *fix* at a high tier. Classify the fix, not the finding.

## Weight — capability/cost class

- **`lightweight`**: trivial-to-cheap, fully-specified or pattern-matched from a sibling file or
  instruction doc, no judgment needed — typo, wrong import, off-by-one, formatting, or boilerplate/
  mechanical work with no new logic.
- **`versatile`**: real judgment needed — reinterpreting a spec/finding, touching more than one
  file/module, or a fix whose shape wasn't fully decided by the review pass.
- **`powerful`**: reserve for a fix that *still carries unresolved design/security ambiguity after
  main's own triage* — not "the finding was tagged Security." If the review pass or main already
  decided the concrete approach (as they should have, including asking the user when it was
  genuinely ambiguous — see below), the fix itself is rarely `powerful` even when the finding was
  severe.

Default to the lower tier when torn; only bump up if you can name the specific judgment call the
lower tier can't make on its own.

## Orientation

- **`generator`**: execute the already-decided pattern faithfully. Most fixes land here once the
  review pass or triage step named the concrete change.
- **`generalist`**: the fix still requires deciding *how*, not just *that* — cross-cutting
  refactor, or a design choice with more than one defensible answer.

## Unresolved judgment calls

If a finding's correct fix is still ambiguous after reading it — a real design decision, not
"this is Security so be careful" — don't guess and don't dispatch it at `powerful` to hedge.
Stop and `ask_user` before classifying it at all, the same way step 7 already does for judgment
calls (e.g. an exception-hierarchy shape with more than one defensible answer). Once the user
picks a direction, the fix is concretely specified and classifies like any other — usually
`versatile/generalist` or lower, rarely `powerful`.

## Grouping vs. tier inflation

Fixes get grouped by file (never dispatch two fixers at the same file concurrently — see step 7).
A file group's tier is normally the *highest* tier any fix in that group needs, since one dispatch
does the whole group. But don't let that rule silently drag mechanical work up to a high tier:

- If a high-tier fix and a low-tier fix land in the same file but are otherwise independent (don't
  touch overlapping lines/logic), prefer **sequencing** over merging: dispatch the high-tier fix
  first, wait for it to return, then dispatch the low-tier fix against the updated file. Both stay
  at their own tier; you just lose parallelism on that one file, not tier accuracy across the whole
  group.
- Only truly merge tiers when the low-tier fix has no independent test/review value apart from the
  high-tier one (e.g. a one-line null-check that's inseparable from the surrounding security fix).

## Thinking level

Separate knob from tier: `low` for small well-specified fixes, `medium`/`high` when the fix still
needs judgment or spans multiple files.

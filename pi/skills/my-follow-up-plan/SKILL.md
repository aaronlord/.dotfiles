---
name: my-follow-up-plan
description: >
  Continue an existing plan under .plans/ by revising it in place or spinning up a new plan that
  inherits its context. Use this skill when the user wants to follow up on, revisit, come back
  to, or build on a previous plan. Do NOT use for net-new planning (my-plan), plan review
  (my-review-plan), or task breakdown (my-plan-to-tasks).
version: 1.3.0
---

# /my-follow-up-plan

Pick up an existing plan and decide, with the user, whether the new request belongs inside that plan or deserves its own — while carrying forward whatever context is useful either way.

## When to use

- The user names or points at an existing plan (directory under `.plans/`) plus what they now want to change or add.
- If the plan isn't named, check the `.plan` symlink at the repo root; if it resolves to a directory under `.plans/`, use that plan. If it's missing or broken, list the directories under `.plans/` and ask which one.
- If the follow-up request isn't stated yet, ask for it before continuing — everything downstream depends on it.

## When NOT to use

- Do not use this skill for net-new work that does not build on an existing directory under `.plans/`; use `/my-plan` instead.
- Do not use this skill when the user wants to stress-test or refine the current plan's `prd.md` and `ard.md` before grooming; use `/my-review-plan` instead.
- Do not use this skill when the plan is already reviewed and the user wants an ordered implementation checklist; use `/my-plan-to-tasks` instead.

## Workflow

### 1. Load the existing plan

Once `{name}` is resolved (per "When to use" above), point `.plan` at it: `ln -sfn .plans/{name} .plan`.

Read, in full:

- `.plans/{name}/context.md`
- `.plans/{name}/prd.md`
- `.plans/{name}/ard.md`
- `.plans/{name}/tasks.md` if present (just to see how much of it shipped — don't open individual task files unless something is unclear)

This is recon input for step 3, not something to re-derive — do not re-scout what these files already answer.

### 2. Ask: update in place, or new plan with this as context?

Ask the user directly with `ask_user`, one question, framed around their follow-up request:

- **Update the existing plan** — the follow-up is a change to the same feature's behavior/scope; `prd.md`/`ard.md` get revised in place.
- **Create a new plan, using this one as background** — the follow-up is its own piece of work that happens to build on decisions already made here.

Give a recommendation: default to "new plan" when the original plan's tasks are already fully implemented (shipped behavior — changing it in place would rewrite history of something already built); default to "update in place" when the plan is still mid-flight (tasks not yet done, or no `tasks.md` yet). State which you're recommending and why, but let the user decide.

### 3a. Branch: update the existing plan in place

1. Check whether the follow-up touches anything not already covered in `context.md`. If so, run [`references/recon.md`](references/recon.md) scoped to just the new ground — dispatch it to a subagent (cheap model is fine) so its depth stays out of this session. Tell it explicitly what's already known from `context.md` so it doesn't re-tread it. Skip this step entirely if the follow-up is purely a change to already-documented behavior.
2. Run [`references/drafting.md`](references/drafting.md) (dispatched to an isolated subagent if you want a clean context, otherwise directly) with:
   - The follow-up request, verbatim.
   - The plan's path (`.plans/{name}/`) — point it at the existing `prd.md`/`ard.md`/`context.md` and have it read them itself rather than pasting their content into the prompt.
   - Any new recon findings from step 1.
   - Explicit instructions: **revise, don't rewrite** — carry forward every section the follow-up doesn't touch verbatim; only change what the new request actually changes. Reset `_Status_` back to `draft` in both `prd.md` and `ard.md` (the follow-up invalidates any prior `/my-review-plan` pass). Run the same self-review scan it normally runs on a fresh draft.
3. Overwrite `.plans/{name}/context.md`, `prd.md`, `ard.md` with what's returned.
4. Leave `tasks.md` and `tasks/` untouched, but flag them as stale in the handback (step 4) if the plan had any — the user will need to re-run `/my-plan-to-tasks {name}` for the affected part of the plan.

### 3b. Branch: new plan, seeded with the old one as context

1. Infer a new feature name from the follow-up request (short, lowercase kebab-case). Show it to the user. If `.plans/{new-name}/` already exists, ask for a different name.
2. Run [`references/recon.md`](references/recon.md) on the follow-up request — dispatch it to a subagent (cheap model is fine). Tell it what the old plan's `context.md` already covers so it doesn't re-discover modules already described there; it should only chase what's new, and return a Precedent Map for it.
3. Cache any URLs in the follow-up prompt the same way `/my-plan` step 5 does, under `.plans/{new-name}/references/`.
4. Create the scaffold `.plans/{new-name}/` (same shape as `/my-plan` step 7), and repoint `.plan` at it: `ln -sfn .plans/{new-name} .plan`.
5. Run [`references/drafting.md`](references/drafting.md) (dispatched to an isolated subagent if you want a clean context, otherwise directly) with:
   - The follow-up request, verbatim.
   - The inferred new feature name.
   - The new recon findings from step 2.
   - Any cached reference pointers from step 3.
   - The old plan's path (`.plans/{name}/`), with instructions to read its `prd.md`/`ard.md`/`context.md` itself for background — inherited decisions (schema, module/aggregate names, established conventions) should be treated as given, not re-derived or re-questioned, unless the follow-up explicitly changes them. Anything inherited but now in tension with the follow-up becomes an Open Question in the new `ard.md`, not a silent override.
   - An explicit instruction to open the new `context.md` with a one-line `## Related Plan` note: path to `.plans/{name}/` and a one-sentence description of what carries over.
6. Write the three returned blocks to `.plans/{new-name}/` exactly as returned.

## Output format

Tell the user:

- Which branch was taken and why.
- The path to the plan that was written to (existing or new) — now the active plan, `.plan` symlink points at it.
- A brief summary of what changed (branch 3a) or what was drafted (branch 3b).
- If branch 3a and the plan had tasks: that `tasks.md`/`tasks/` are now stale for the changed portion — re-run `/my-plan-to-tasks {name}`.
- If branch 3a: `prd.md`/`ard.md` were reset to `draft` and revised — tell the user to review and hand-edit them (they're a terse rough draft, not a finished spec) before running `/my-review-plan {name}`.
- If branch 3b: the link back to the originating plan. Tell the user to review and hand-edit the new `prd.md`/`ard.md` (fix the tree, adjust contracts, drop in notes) before running `/my-review-plan {new-name}`.

## Anti-patterns to avoid

- Do not re-scout what `.plans/{name}/context.md`, `prd.md`, `ard.md`, or `tasks.md` already answer.
- Do not open individual task files unless something is unclear.
- Do not run [`references/recon.md`](references/recon.md) for branch 3a when the follow-up is purely a change to already-documented behavior.
- Do not rewrite untouched sections when revising an existing plan; **revise, don't rewrite**.
- Do not modify `tasks.md` or `tasks/` in branch 3a; only flag them as stale in the handback if needed.
- Do not silently override inherited decisions in branch 3b; anything now in tension with the follow-up becomes an Open Question in the new `ard.md`.

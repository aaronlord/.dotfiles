# Drafting contract (follow-up plans)

The base contract is [`../my-plan/references/drafting.md`](../my-plan/references/drafting.md) — read it in full first. Templates, section lists, precedent rules and self-review scans all come from there. This file records only where follow-up drafting differs.

## Deltas

1. **No grill happened.** The base contract assumes the orchestrator grilled the user on no-precedent items before dispatching. `/my-follow-up-plan` does not grill. So: where the base contract says a no-precedent decision was already answered, you instead pick the simplest option consistent with existing patterns and record it as `[NEEDS CLARIFICATION: specific question]` under `ard.md`'s Open Questions. Still never ask the caller a question directly.

2. **Inherited decisions are given.** Schema, module/aggregate names, and conventions established by the originating plan are treated as precedent — as binding as anything recon found in the codebase. Do not re-derive or re-question them. Anything inherited but now in tension with the follow-up becomes an Open Question, never a silent override.

3. **Revise, don't rewrite** (branch 3a only). Carry forward verbatim every section the follow-up doesn't touch. Only change what the new request actually changes. Reset `_Status_` to `draft` in both `prd.md` and `ard.md`.

4. **Related Plan note** (branch 3b only). Open the new `context.md` with a `## Related Plan` line: path to the originating plan and one sentence on what carries over.

5. **You may read the plan files.** The base contract forbids exploration; reading the originating plan's `context.md`/`prd.md`/`ard.md` (and, in branch 3a, the ones you're revising) is expected and does not count as exploration.
</content>

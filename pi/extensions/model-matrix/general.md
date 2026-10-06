# Model matrix — framework

General framework mapping a task's suggested `{weight}/{orientation}` (assigned by
`/my-plan-to-tasks`) to a model + thinking level, and for picking a model in normal chat. This part
is machine/repo-agnostic — concrete model names, costs, and current tier assignments live in
`model-matrix.md`: a repo-local `{repo root}/.agents/model-matrix.md` wins if present, otherwise
the per-machine `~/.pi/agent/model-matrix.md` (neither is versioned by default; either may not
exist). `/model-matrix` and the `model_matrix` tool resolve this automatically — anywhere else
this doc says "model-matrix.md", that's the resolution order meant.

## Authority ladder

Every task also sits on one of three trust tiers — how much damage a mistake could do, and how
much checking that earns:

- **Read-Only** — only inspects/reports, can't change the repo. One pass is enough.
- **Draft-Only** — proposes something a human must approve before it lands. This is the
  `draft-only` tier value in `tasks.md`'s Tier column (formerly `interactive-only`) —
  `/my-implement-tasks` halts and hands it to `/my-implement-task`'s inline conductor mode instead
  of dispatching it.
- **Action-Allowed** — commits on its own, no human in the loop first. Every `{weight}/{orientation}`
  pair in `model-matrix.md` defaults to this tier, which is why it gets the audit + gate in
  `/my-implement-tasks` steps 5.3/5.4 before a commit lands.

## Two axes

- **Weight** — capability/cost class: `lightweight` (trivial-to-cheap, fully/well-specified,
  low-risk) / `versatile` (typical feature work) / `powerful` (novel, cross-cutting, or
  high-stakes).
- **Orientation** — capability style:
  - `generator`: code and artifact production. Implementing features, writing tests, refactoring, fixing bugs, and executing well-bounded technical tasks. Favors strong coding ability, instruction-following, and test-driven validation.
  - `generalist`: open-ended reasoning, cross-cutting architectural trade-offs, synthesis, and prose/instruction writing. Favors high reasoning depth, judgment under ambiguity, and self-correction over pure code throughput.
  Both are the DAG (Directed Acyclic Graph — execution flows one-way through dispatch nodes, never looping back to an earlier one) **Generator** node (they produce artifacts); see **Reviewer** below for the checking node.

Thinking level is a separate knob from model choice: `low` for small well-specified work, up to
`medium`/`high` when the task needs judgment, ambiguity, or cross-cutting changes.

The concrete weight × orientation → model/thinking table, and per-model cost/strength profiles,
live in `model-matrix.md` (see resolution order above).

## Reviewer

The DAG's other node type (Generator/Reviewer & Gate split) — checks a Generator's output
(trajectory audit in `/my-implement-tasks` 5.3, standards/spec gate in 5.4), always in its own
fresh subagent context, never the orchestrator itself.

**Default**: no separate lookup — reuse the exact `model`/`thinkingLevel` the Generator dispatch
just used for that task. Fresh context at the same tier is what buys the independent check, not a
heavier model; escalating by default would just spend more without a specific reason to.

**Overrides**: a weight/orientation (or task) can get a different reviewer than its generator (e.g.
force an opus-class check regardless of cost). This override table, when populated, lives in
`model-matrix.md` since it names concrete models — leave it empty until you actually
want one.

## Draft-only

A task tagged `draft-only` isn't in the weight/orientation table — it means don't autonomously
dispatch it; run it via `/my-implement-task`'s inline conductor mode instead.
`/my-implement-tasks` halts rather than resolving a model for these.

## Fallback

No tier, tier doesn't parse, or `model-matrix.md` (repo-local or global, see resolution order
above) is missing → dispatch with no
`model`/`thinkingLevel` override and let the `subagent` tool use its own default. Don't halt the
loop over it.

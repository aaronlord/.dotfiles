# Agent Skills

Conventions for anyone adding or editing a skill under `pi/skills/`. Skills are reusable agent
workflows (procedural memory), not coding standards — for standards/conventions use a project's
own `AGENTS.md` instead. This file follows the open [Agent Skills](https://agentskills.io)
standard.

## Naming

- **Namespace prefix: `my-`** — every skill directory and `name` frontmatter field is prefixed
  `my-<name>` (e.g. `my-quick-plan/` with `name: my-quick-plan`), so every slash-command
  invocation reads `/my-<name>` (e.g. `/my-plan`, `/my-fix-pr`). These are personal, cross-project
  skills that live in dotfiles and load in every project via `~/.pi/agent/skills` — the prefix
  keeps them visually distinct from any project-local skills a repo defines for itself, and avoids
  a bare name like `plan` or `review` colliding with a project's own skill of the same name.
- **Directory name: kebab-case (within the `my-` prefix)**, matching the `name` frontmatter field
  exactly (e.g. `my-quick-plan/` with `name: my-quick-plan`).
- Prefer gerund form for the concept where it reads naturally (`processing-pdfs`, not
  `pdf-processor`), but don't force it over a clearer imperative/noun form already in use here
  (e.g. `my-grill-me`, `my-remember`).
- Avoid generic names (`helper`, `utils`, `tools`), vendor prefixes (`claude-*`, `copilot-*`), and
  internal jargon a new teammate wouldn't recognize.

## Folder structure

```
my-skill-name/
├── SKILL.md            # Required: YAML frontmatter + markdown instructions
├── scripts/             # Optional: executable helper scripts (Python, Bash)
├── references/          # Optional: supplementary context loaded only as needed
└── assets/              # Optional: files used in output (templates, resources)
```

Any file that isn't the top-level instructions belongs under `references/` (or `scripts/`/
`assets/` if it's code or an output template) — never loose at the skill root. A skill root
cluttered with extra `.md` files is a sign it should be moved into `references/`.

## Frontmatter

```yaml
---
name: my-skill-name
description: >
  [What it does, one verb-led sentence.] Use this skill when the user [trigger phrase 1],
  [trigger phrase 2]. Do NOT use for [anti-trigger 1].
version: 1.0.0
allowed-tools: [Optional] Bash(specific-cli:*)
---
```

- `name` and `description` are required; both stay resident in the agent's context on every
  turn (progressive disclosure level 1), so the description is the routing algorithm — spend
  more time on it than any other line in the file.
- `version` is required (start at `1.0.0`, bump when behavior changes) — skills are dependencies
  of your setup, not throwaway notes; version them like you'd version a library.
- `allowed-tools` is optional — only set it when the skill genuinely needs to restrict tool
  access (e.g. `my-playwright-cli` scoping to `Bash(playwright-cli:*)`).
- **No `license` field, no `metadata` block.** This is a personal dotfiles repo, not a published
  package — neither field earns its place.

### The description field

- State what it does **and** when to use it. Front-load trigger keywords ("Fetch open PR review
  comments and…", not "This skill helps with…").
- Include an explicit when-NOT-to-use clause whenever there's a plausible confusion with another
  skill (e.g. `my-implement-task` vs `my-implement-tasks`, `my-plan` vs `my-quick-plan`).
- Be pushy if the model under-triggers on the intended phrasing — repeat the exact words a user
  would say.
- Aim for ~50 words; hard cap ~200 characters for cross-tool API compatibility, ~1024 in YAML.

## Body sections

Canonical sections, in this order, adapted to what a given skill actually needs — **omit any
section that doesn't genuinely apply rather than padding it out**:

1. `## When to use` — concrete trigger scenarios (can be folded into an `## Invocation` section
   for skills that take a specific argument shape, e.g. `/my-plan-to-tasks {name}`).
2. `## When NOT to use` — out-of-scope scenarios, especially the neighboring skill someone might
   reach for instead.
3. `## Workflow` / `## Process` — the numbered steps. This is the one section every skill has;
   name it whichever reads better for that skill's shape (a linear process vs. a set of phases).
4. `## Examples` — input → output pairs, where a worked example clarifies more than prose.
5. `## Output format` — what the final artifact/report looks like, referencing
   `assets/template.md` if one exists.
6. `## Anti-patterns to avoid` — mistakes seen in practice, each with the reason it's wrong.

## Self-contained skills, no external agent dependency

Skills under `pi/skills/` must not depend on `pi/agents/*.md` files existing or matching their
current content to function. Where a skill's workflow needs a detailed contract — an
implementation standard, a review rubric, a drafting template — that contract lives in the
skill's own `references/*.md`, not in a separate top-level agent file the skill merely points at.
Duplication across skills (e.g. the same implementation contract copied into both
`my-implement-task/references/` and `my-implement-tasks/references/`) is the correct trade-off:
each skill stays independently readable and versionable, and a change to one skill's contract
can't silently break another skill that happened to share a file.

`pi/agents/*.md` still exists as a library of standalone, general-purpose subagents dispatchable
directly via the `subagent` tool (`codebase-locator`, `artifact-code-reviewer`, `worker`, and
friends) — that's a separate, complementary concern from skills, not a dependency skills should
reach into. When a skill wants isolated execution (a clean context for a review pass, a
dispatched implementation step), it dispatches the generic `worker` agent and hands it the
relevant `references/*.md` contract as task instructions, rather than naming a specialist agent
file whose prompt lives outside the skill.

## The five rules

1. **One skill, one job.** If you can't describe what it does in one sentence, it's two skills
   — decompose before writing.
2. **Descriptions are an interface.** The agent picks skills by reading descriptions; a vague
   one means an unused skill.
3. **Skills are dependencies.** Version them, review changes to them like any other code.
4. **The right owner writes the skill.** Domain skills (e.g. `my-domain-modeling`) should be
   shaped by whoever owns that domain, not treated as an AI-team bottleneck.
5. **The runtime is interchangeable.** Don't hard-code assumptions about one specific agent tool
   beyond what this file states — portability is most of the value.

## Quality principles

- Run the task yourself first; real failure produces signal, speculation produces noise.
- Give the reason, not just the rule — if you're typing "ALWAYS"/"NEVER" in caps, explain the
  rationale instead so the model generalizes to edge cases you didn't enumerate.
- Every line should earn its place — keep gotchas, exact commands, anti-patterns; cut boilerplate
  the model already knows.
- Make instructions verifiable — if the agent can't tell whether it followed a rule, the rule is
  too vague.
- Bundle what repeats — helper logic the agent keeps re-deriving belongs in `scripts/`.

## Skill smells (revise if you see these)

- Over ~5,000 words in `SKILL.md` — split into two skills, or move detail into `references/`.
- You can't write three test cases for it — the description is too vague, or the skill does too
  many things.
- It references no other resource at all — might just be a long instruction that belongs in a
  project's `AGENTS.md` instead of a skill.
- Its description starts with "a helpful skill for…" — rewrite to name the trigger, the input,
  and the output instead.

## Adding a new skill

1. Confirm no existing skill's description already covers this trigger — if two would overlap,
   that's a naming/scope collision to resolve before writing either.
2. Create `my-skill-name/SKILL.md` with the frontmatter and body shape above.
3. Cross-check neighboring skills for a "when NOT to use" that should now mention the new one
   (and vice versa) — e.g. `my-plan` and `my-quick-plan` should each rule out the other's scope.
4. If the skill wraps a multi-step workflow with reusable machinery, factor the detail into
   `references/*.md` and keep `SKILL.md` itself short enough to stay in the trigger's context
   budget.
5. These skills load in every project via `~/.pi/agent/skills` (symlinked to this directory) —
   keep content generic to any codebase. Project-specific narrowing (a particular stack, a
   particular `app/{Module}` layout, project-specific paths) belongs in that project's own
   `.agents/skills/` or `.pi/agent/skills/`, not here.

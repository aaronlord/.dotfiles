---
name: remember
description: Teach the agent something — a rule, a style preference, or a lesson from a mistake made this session. Persists the learning to the right AGENTS.md and logs it to ~/.dotfiles/ai/lessons/. Use when the user says "/remember", "learn from this", "remember this", or wants to correct agent behaviour going forward.
argument-hint: "What should the agent learn? (optional — can be vague like 'from this session' or specific like 'always use static arrow functions')"
---

# remember

The user wants to teach you something. Your job is to understand the lesson, draft a concise rule and a richer journal entry, confirm everything with the user, and write it to the right place.

When this skill is invoked, immediately begin the workflow below. Do not ask the user if they want to proceed — just start.

## Workflow

### 1. Understand the lesson

Check whether the skill was invoked with an argument (text after the trigger word):

- **No argument at all** — only then ask: *"What would you like me to learn?"* Wait for the answer before continuing.
- **Vague argument** (e.g. `/remember from the mistakes you made with those tests`, `/remember from this session`) — do NOT ask what to learn. Instead, look back at the conversation, identify what went wrong or what was discussed, **propose** the lesson yourself, and ask the user to confirm or refine that specific proposal.
- **Specific argument** (e.g. `/remember always use named exports, never default exports`) — do NOT ask what to learn. Treat the argument as the lesson directly. State it back as an actionable rule and move on to step 2.

**Never ask "What would you like me to learn?" if the user already supplied an argument.**

Always make sure you can state the lesson as a clear, actionable rule before moving on.

### 2. Ask where the learning should live

Ask the user explicitly — do not infer:

> "Where should this rule live?"
> 1. **Project** — this project's `AGENTS.md` (applies only here)
> 2. **Dotfiles** — `~/.dotfiles/AGENTS.md` (applies across all your projects)

If the user picks **project** and there is no `AGENTS.md` in the current working directory, ask before creating it:

> "There's no `AGENTS.md` in this project yet. Should I create one?"

### 3. Draft the rule and the journal entry

**Rule** (for AGENTS.md) — one to three lines, imperative, no fluff. It should read like an instruction to a future agent:

```
Always use static arrow functions for class methods, never `method() {}` syntax.
```

**Journal entry** (for `~/.dotfiles/ai/lessons/`) — a timestamped markdown file named `YYYY-MM-DD-<slug>.md`. It should contain:

```markdown
# <Short title of the lesson>

**Date:** YYYY-MM-DD  
**Project:** <project name or "global">  
**Destination:** <path to AGENTS.md where rule was written>

## What happened

<1–3 sentences describing the context: what the agent did wrong, or what the user wanted to teach.>

## The lesson

<The rule, verbatim as written to AGENTS.md.>

## Why it matters

<1–2 sentences on why this rule improves the agent's behaviour for this user.>
```

### 4. Show a preview and confirm

Show the user **both** the rule and the journal entry before writing anything:

> Here's what I'll write:
>
> **Rule → `<path/to/AGENTS.md>`**
> ```
> <rule text>
> ```
>
> **Lesson log → `~/.dotfiles/ai/lessons/YYYY-MM-DD-<slug>.md`**
> ```markdown
> <full journal entry>
> ```
>
> Shall I write this? (yes / edit / cancel)

If the user wants to edit, ask them what to change and update the draft. Loop until they confirm.

### 5. Write the files

**AGENTS.md:** Append the rule as a new line (or new section if the file is structured). Do not reformat or rewrite existing content.

**Lesson log:** Create `~/.dotfiles/ai/lessons/YYYY-MM-DD-<slug>.md` with the journal entry. Create the directory if it doesn't exist.

### 6. Confirm completion

Tell the user exactly what was written and where:

> ✅ Rule added to `<path>`  
> 📓 Lesson logged to `~/.dotfiles/ai/lessons/YYYY-MM-DD-<slug>.md`

## Rules for writing good rules

- Imperative mood: "Always X", "Never Y", "Use X for Z"
- Specific, not vague: "Use `const fn = () => {}` for class methods" not "write better functions"
- One rule per lesson — if there are multiple lessons, run through this workflow once per lesson
- If the lesson is about a style preference, include a concrete before/after example in the journal entry if possible

## Notes

- Never overwrite or restructure existing AGENTS.md content — only append
- The lesson journal is a long-term log; never edit or delete existing entries
- If the user says `/remember from this session`, look at the whole conversation for multiple lessons — walk through them one at a time, each as a separate `/remember` run

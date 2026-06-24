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

### 2. Determine where the learning should live

**First, detect whether you are inside a real project.**

A "real project" means the current working directory contains at least one of: `package.json`, `composer.json`, `Gemfile`, `pyproject.toml`, `.git/`, or an `AGENTS.md` file that is not `~/.dotfiles/AGENTS.md`.

---

#### If NOT in a real project (e.g. CWD is `~/.dotfiles`)

Ask the user:

> "Where should this rule live?"
> 1. **Project** — this project's `AGENTS.md` (applies only here)
> 2. **Dotfiles** — `~/.dotfiles/AGENTS.md` (applies across all your projects)

If the user picks **project** and there is no `AGENTS.md` in the current working directory, ask before creating it:

> "There's no `AGENTS.md` in this project yet. Should I create one?"

Then skip to step 3.

---

#### If IN a real project

**Step 2a — Scan the project for candidate destination files.**

Run two scans (exclude `node_modules/`, `vendor/`, `.git/`):

1. Find all `AGENTS.md` files in the project tree.
2. Find all `.github/instructions/*.instructions.md` files.

**Step 2b — Classify the lesson.**

Decide which of these three categories the lesson belongs to:

- **File-type-specific**: the lesson is about how to write or structure a particular named type of file. Examples: Vue components, PHP controllers, TypeScript interfaces, browser tests, domain events, command handlers, value objects, DTOs, aggregates, repositories. The decisive test: *is there already an `.instructions.md` file for a similar pattern in this project, or would it make sense to create one?* If yes, treat the lesson as file-type-specific even if the rule sounds like a general architectural principle — e.g. "domain events should extend a common abstract base class" is file-type-specific because it only matters when writing a domain event file.
- **Subtree-specific**: the lesson is about a particular area of the codebase (e.g. test files, frontend code) but is not tied to a single file type.
- **General project rule**: the lesson applies to every file in the project regardless of type or location.

**Step 2c — Build the ranked suggestion list using this exact decision tree:**

1. If the lesson is **file-type-specific**:
   - Check whether an existing `.instructions.md` file already has a glob that would match the relevant files.
   - If yes → rank that existing file first.
   - If no → rank "create a new `.instructions.md`" first. Before suggesting creation, verify no existing instruction file's glob overlaps with what the new glob would be. If overlap exists, do NOT offer to create a new file — instead, rank the overlapping existing file first and note that the rule should be added there to avoid glob conflicts.

2. If the lesson is **subtree-specific**:
   - Find the `AGENTS.md` file whose directory is closest (most specific ancestor) to the files being discussed in the conversation.
   - Rank that `AGENTS.md` first.

3. If the lesson is **general project rule**:
   - Rank the project root `AGENTS.md` first (create it if it doesn't exist — ask first).

4. Always include these as lower-ranked options:
   - If not already ranked first: offer to create a new `.instructions.md` file (or add to an existing one if a matching glob exists). **Before proposing a glob**, read the `applyTo:` frontmatter of at least two existing `.instructions.md` files in the project to learn the project's glob convention, then propose a glob that follows the same pattern. Do not guess the glob format without checking.
   - All other `AGENTS.md` files found in the project (listed by path)
   - `~/.dotfiles/AGENTS.md`

**Step 2d — Present the ranked list and ask the user to confirm.**

Format the question exactly like this, substituting in the real paths and your recommended pick:

> "Where should this rule live? My recommendation is **[destination]** because [one-sentence reason]."
>
> 1. ✅ `[recommended destination]` ← suggested
> 2. `[next option]`
> 3. `[next option]`
> …
> N. `~/.dotfiles/AGENTS.md` (global — all projects)
>
> Type a number, or describe a different destination.

Wait for the user's answer before continuing.

### 3. Draft the rule and the journal entry

**Rule** (for the destination file) — one to three lines, imperative, no fluff. It should read like an instruction to a future agent:

```
Always use static arrow functions for class methods, never `method() {}` syntax.
```

**Journal entry** (for `~/.dotfiles/ai/lessons/`) — a timestamped markdown file named `YYYY-MM-DD-<slug>.md`. It should contain:

```markdown
# <Short title of the lesson>

**Date:** YYYY-MM-DD  
**Project:** <project name or "global">  
**Destination:** <path to the file where rule was written>

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
> **Rule → `<path/to/destination>`**
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

**Destination file:**
- If writing to an `AGENTS.md`: append the rule as a new line (or new section if the file is structured). Do not reformat or rewrite existing content.
- If writing to a `.github/instructions/*.instructions.md` file that already exists: append the rule under the existing body. Do not modify the frontmatter.
- If creating a new `.instructions.md` file: write it with frontmatter and the rule as the body:
  ```markdown
  ---
  applyTo: "<glob>"
  ---
  <rule text>
  ```

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

- Never overwrite or restructure existing `AGENTS.md` or `.instructions.md` content — only append
- Never modify the `applyTo:` frontmatter of an existing `.instructions.md` file
- Never create a new `.instructions.md` whose glob would overlap with an existing one — overlapping globs cause unpredictable behaviour across agent tools. If overlap would occur, add the rule to the existing file instead
- The lesson journal is a long-term log; never edit or delete existing entries
- If the user says `/remember from this session`, look at the whole conversation for multiple lessons — walk through them one at a time, each as a separate `/remember` run

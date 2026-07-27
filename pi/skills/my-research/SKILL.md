---
name: my-research
description: >
  Research a topic or question using live web search rather than training data alone,
  cross-checking multiple credible sources and citing them. Use when the user says
  "/my-research", asks to research/look up/find out about something, or needs current/factual
  information (news, prices, versions, docs, comparisons, statistics) that could be stale in
  training data. Do NOT use for teaching a concept over multiple sessions; use my-teach.
version: 1.0.0
---

# /my-research

Answer the user's question by searching the web, not by recalling training data. Training data is stale and unverifiable — every non-trivial factual claim in the final answer must trace back to a fetched source.

## When to use

- The user says `/my-research`, asks to research/look up/find out about something.
- The question needs current/factual information (news, prices, versions, docs, comparisons, statistics) that could be stale in training data.

## When NOT to use

- Do NOT use for teaching a concept across persistent sessions with lessons and exercises; use `my-teach`.
- Do NOT use when parametric knowledge is uncontroversial background with no time-sensitive, numeric, or contestable claim to verify.

## Workflow

### 1. Pin down the question

If the request is vague ("research AI agents"), ask one clarifying question via `ask_user` to narrow scope: what decision or use this feeds, what time window matters (latest/historical), any sources to prefer or avoid. Skip this if the question is already specific and well-scoped.

### 2. Search with varied angles

Use `web_search` with `queries` (plural) — 2-4 distinct phrasings/angles, not near-duplicates. Vary: broad overview, specific sub-question, comparison/alternatives, recent-news angle. Use `recencyFilter` (`day`/`week`/`month`/`year`) whenever the topic is time-sensitive (news, releases, pricing, "latest", "current").

Never answer from a single query's synthesized snippet alone if the topic has any nuance — treat the first pass as a map of what's out there, not the answer.

### 3. Verify with primary/credible sources

For claims that matter (numbers, dates, quotes, "X is now the case"), open the actual source:

- Prefer primary sources: official docs, vendor announcements, government/institutional data, the paper/repo itself over a blog summarizing it.
- Prefer sources with visible authorship, dates, and citations of their own over anonymous SEO content.
- Use `fetch_content` (or `get_search_content` on prior `web_search` results) to pull full text when a snippet is ambiguous, old, or high-stakes.
- Cross-check any surprising or load-bearing claim against a **second independent source**. If two sources disagree, say so explicitly rather than picking one silently.

### 4. Track sources as you go

Keep a running list of `{claim → source URL, publish date if known}`. Note source dates — a claim from a 2021 blog post presented as current is a failure mode to avoid explicitly.

### 5. Synthesize the answer

Write the answer with inline citations (link or `[Source: <name>](<url>)`) next to the claims they support — not a single bibliography dump at the end with no mapping to specific claims. Structure:

- Direct answer up front.
- Supporting detail with citations.
- Explicit note on any disagreement between sources, or where information is thin/unconfirmed.
- A "Sources" list at the end with full URLs, deduplicated.

If training-data knowledge fills in uncontroversial background (e.g. "HTTP is a protocol"), that's fine unstated — but anything time-sensitive, numeric, or contestable needs a citation. If web search can't confirm something the model "knows," say so rather than asserting it.

### 6. Flag gaps

If searches turn up thin, contradictory, or paywalled-only sources, say so plainly rather than papering over it with confident prose. Don't stretch a weak source to sound authoritative.

## Output format

- Direct answer up front, with inline citations next to the claims they support.
- Explicit note on any disagreement between sources, or where information is thin/unconfirmed.
- A deduplicated "Sources" list at the end with full URLs.

## Anti-patterns to avoid

- Answering from a single query's synthesized snippet when the topic has any nuance.
- Presenting a stale source (e.g. an old blog post) as current without noting its date.
- Bibliography-dumping sources at the end with no mapping to specific claims.
- Asserting something from parametric knowledge as fact when it's time-sensitive, numeric, or contestable and web search can't confirm it.

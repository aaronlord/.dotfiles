---
name: implement-figma-design
description: Implement a UI from a Figma design link/node in an existing codebase. Use when the user gives a Figma URL (figma.com/design/...) and wants it built/implemented/matched in code, especially "mock" or throwaway pages as well as production features.
---

# Implement Figma Design

Turn a Figma node into working code that matches the codebase's existing conventions, not just the pixels. Prefer reusing existing layouts/components over inventing new ones.

## 1. Read the Figma node cheaply first

- Parse `fileKey` and `nodeId` out of the URL (`.../design/{fileKey}/...?node-id=1234-5678` → nodeId `1234:5678`).
- Call `figma_get_metadata` first — it's cheap and gives the component tree without a big payload. Use it to find the specific sub-node(s) you actually need (e.g. the table, the tabs row, the header) instead of the whole page.
- Call `figma_get_screenshot` at multiple scopes: the whole frame for overall layout, and specific sub-frames for anything ambiguous. **Don't assume a component/region is meaningful — screenshot it.** Areas that look present in metadata (tabs, filter selects, etc.) sometimes render completely blank/empty in the actual design; if so, skip implementing them rather than inventing content.
- Only call `figma_get_design_context` on small, scoped nodes (a single component/table/section) — calling it on a large top-level frame times out. If it says Code Connect mappings are missing, ask the user (via `ask_user`, exact script, one question) whether to connect them.

## 2. Code Connect mapping (if offered/accepted)

If the user agrees to map components:
1. Call `figma_get_code_connect_suggestions` for the scoped node.
2. For each suggested Figma component, search the codebase for the real matching component (grep for exports, check the design system package's docs, existing usage patterns).
3. Present matches to the user in the exact required format and wait for confirmation — don't auto-apply.
4. Call `figma_send_code_connect_mappings` with the confirmed list. Duplicate "failed to map" errors for repeated instances of the *same* master component are expected and not a real error (Code Connect maps per master component, not per instance).
5. Use **relative repo paths** in `source`, never absolute paths — especially if you're working inside a git worktree, which may get deleted. Check `git worktree list` if unsure whether cwd is a worktree.

## 3. Scope the implementation before writing code

- If the design implies a brand-new module/page that doesn't exist in the codebase yet, don't assume — `ask_user` whether to build it as a full feature, a specific existing module, or a pure frontend mock.
- If it's a mock: still find and mirror an existing sibling page/module with a similar shape (list page, table page, form page, etc.) and copy its structure/conventions — layout wrapper, header component, table component, patterns for actions — rather than building from scratch.
- Read the actual UI component library's docs (e.g. `node_modules/**/dist/docs/*.md`) for usage guidance, but don't trust prop names/values from docs or copy-pasted examples elsewhere in the codebase at face value.

## 4. Verify component props by introspection, not assumption

Component libraries often have props with a fixed enum of valid values enforced by a runtime validator that isn't visible in `.md` docs or minified dist files via grep. Before using a prop value copied from another file in the codebase, verify it against the actual shipped component:

```bash
node -e "
import('path/to/dist/main.mjs').then(m => {
  const prop = m.ComponentName.props.propName;
  console.log(prop.validator ? prop.validator.toString() : 'no validator');
}).catch(e => console.error('ERR', e.message));
"
```

This surfaces the real allowed values (e.g. `theme` might allow `brand`/`base`/`transparent`/... but not `primary`, even if some other file in the repo uses `primary` incorrectly). Do this for any prop you're unsure about instead of guessing.

## 5. Wire up minimal backend plumbing (if a real route is wanted)

- Mirror the simplest existing controller pattern for a static/no-props page (e.g. an existing `WelcomeController`-style invokable controller + `Inertia::render('Module/Index')` with no props).
- Add the route next to similar routes in the router file.
- If the project generates typed route helpers/testids/types from backend code (Wayfinder, similar codegen), **find the project's exact canonical regeneration command** — check CI workflow files (`.github/workflows/*.yml`) or `AGENTS.md`/instructions files for the precise invocation with flags (e.g. `--path=... --with-form --skip-actions`). Running the bare CLI command without those flags can dump output into the wrong directory outside `.gitignore`.
- After regenerating, run `git status --porcelain` and clean up any stray/duplicate generated directories the bare command may have created before you found the right invocation.
- If the app has a test-id registry (a config file mapping dot-paths to `data-testid` strings, consumed by a `testId()` helper), add new entries there mirroring a sibling module's shape, then regenerate — don't just hardcode test ids in the template and hope.

## 6. Add navigation entry (if applicable)

Mirror the existing nav/sidebar array pattern exactly: same route-array shape, an icon + active-icon pair from the same icon set already used, inserted in the position implied by the design (if the design shows a nav item order, match it).

## 7. Run the project's own checks

Run the project's actual format/lint/type-check/static-analysis commands (not generic ones) — the project's `AGENTS.md`/CI usually names them exactly. Fix everything the tools flag before moving on.

## 8. Verify live in a browser, not just visually

- Log in via the project's own login-automation skill/flow if one exists.
- Navigate to the new route with Playwright (or equivalent) and read the **console**, not just a screenshot.
- Before treating any console error as caused by your change, load a known-good sibling page and check whether the same error/warning appears there too (e.g. environment-level heartbeat pings, legacy i18n warnings, framework warnings from multi-root templates). Only fix what's actually new/caused by your change — don't chase pre-existing environmental noise.
- Fix each genuinely new error, reload, and confirm the console is clean relative to the baseline.
- Take one final screenshot to confirm visual parity with the Figma design.
- Clean up any temp artifacts (screenshots, browser tool logs) created during verification.

## 9. Report back concisely

Summarize: what was built, what existing patterns were reused, what was intentionally skipped (and why — e.g. "tabs row was empty in the Figma screenshot"), what Code Connect mappings were saved, and what checks were run and passed.

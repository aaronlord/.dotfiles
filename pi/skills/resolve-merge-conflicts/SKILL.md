---
name: resolve-merge-conflicts
description: Use when you need to resolve an in-progress git merge/rebase conflict.
---

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

4. Run the project's **automated checks** and fix anything the merge broke. For PHP projects that usually means:

   ```bash
   ./vendor/bin/pint                        # format
   ./vendor/bin/phpstan analyse --memory-limit=1G
   ./vendor/bin/pest --ci --parallel --compact
   ```

   For JS/TS, run the project's typecheck, lint, and tests. If the project has a `.bin/magnus` wrapper, use that instead. Discover the real commands before assuming.

5. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue the rebase process until all commits are rebased.

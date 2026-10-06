# Git worktrees with worktrunk

This machine uses [`wt` (worktrunk)](https://github.com/worktrunk/worktrunk)
to create/switch/remove git worktrees.

There are two layers of config:

- **Personal / user config** — `~/.config/worktrunk/config.toml`
  (this machine only, not committed anywhere). Owned by this repo's
  `~/.dotfiles` conventions (tmux session management).
- **Per-project config** — `<repo>/.config/wt.toml`, committed to that
  repo, proposed to the team, shared by everyone who uses worktrees on
  it. See that repo's own docs for its specific hooks and aliases
  (e.g. the `open` alias, `health-portal`'s
  `docs/getting-started/worktrees.md`).

## One-time setup on a new machine

```sh
wt config shell install   # writes the shell integration into ~/.bashrc
```

Then start a **fresh** shell (or `source ~/.bashrc`) — the currently
running shell won't pick up the wrapper function. Confirm with:

```sh
wt config show   # should show "Shell integration active", no warning
```

Without this, `wt switch`/`wt switch --create` print the target
directory but can't actually `cd` your shell into it.

## Everyday commands

```sh
wt switch --create my-branch   # create a worktree + branch, cd into it
wt switch my-branch            # switch to an existing worktree, cd into it
wt switch pr:1234              # check out a PR into its own worktree
wt remove my-branch            # tear down the worktree (+ branch, if merged)
wt list                        # status of every worktree (dirty/clean/ahead-behind)
```

`wt switch --create` and `wt remove` both run **hooks** — see the
per-project `.config/wt.toml` for what actually happens (env file
patching, copying gitignored files, starting/stopping containers,
etc.), and this machine's `~/.config/worktrunk/config.toml` for the
personal tmux session automation layered on top.

## Personal user config (`~/.config/worktrunk/config.toml`)

```toml
[post-start]
tmux-session = "session=$(basename {{ worktree_path }} | tr . _) && tmux new-session -ds \"$session\" -c {{ worktree_path }} && tmux send-keys -t \"$session\" 'test -x tmux.sh && ./tmux.sh '\"$session\"' {{ worktree_path }}' C-m"

[post-switch]
tmux-attach = "session=$(basename {{ worktree_path }} | tr . _) && tmux switch-client -t \"$session\" 2>/dev/null || true"

[post-remove]
tmux-kill = "session=$(basename {{ worktree_path }} | tr . _); current=$(tmux display-message -p -t \"${TMUX_PANE:-}\" '#S' 2>/dev/null || tmux display-message -p '#S' 2>/dev/null || true); if [ \"$current\" != \"$session\" ]; then tmux kill-session -t \"$session\" 2>/dev/null || true; fi"
```

- Creating a worktree spins up a detached tmux session named after the
  worktree **directory** (matching `tmux-sessionizer`'s naming, dots
  replaced with underscores), not the branch, and runs the repo's own
  `./tmux.sh` if it has one (a no-op guard, so this applies harmlessly
  to repos without one).
- **Every** `wt switch` (not just creation) re-attaches your tmux
  client to that worktree's session.
- Removing a worktree kills its tmux session, unless that session is active; active session stays put instead of tmux selecting another session.

An `open` alias (`wt open`, or a `w` tmux keybinding wired up per-repo)
to jump straight to a branch's dev URL is deliberately **not** defined
here — it needs to know a specific repo's host/port convention (e.g.
`http://magnus.localhost:<port>` vs plain `http://localhost:<port>`,
and whether the primary worktree's `.env` is patched the same way
every other worktree's is), which a config meant to apply to every repo
can't know in general. Define it per-project instead, in that repo's
own `.config/wt.toml` — see `health-portal`'s as a worked example.

This file applies to **every** repo you use worktrunk on, not just one
project — it no-ops cleanly on repos without a `tmux.sh`.

## `bin/lib/worktree-utils`

Trimmed down to only what's still used — a personal reference
implementation, safe to source from **personal** aliases/scripts on
this machine, but **do not reference it from a team-shared
`.config/wt.toml`** (see the gotcha below for why).

```sh
source ~/.dotfiles/bin/lib/worktree-utils
patch_worktree_env <env_file> <repo_name> <slug> <app_port> <vite_port>
```

Patches `COMPOSE_PROJECT_NAME` (lowercased — Docker Compose rejects
uppercase project names, and ticket-prefixed branches like `MNG-2197`
commonly have them), `APP_URL` (port rewritten), `APP_PORT`, and
`VITE_PORT` into a worktree's `.env`, given deterministic values
worktrunk's own `{{ branch | hash_port }}` template filter already
computed.

Slug/path/port computation is otherwise left to worktrunk's own
template variables/filters (`{{ branch | sanitize }}`,
`{{ worktree_path }}`, `{{ branch | hash_port }}`) rather than
reimplemented here — they don't require a repo-wide directory scan.

## Adding this to another repo

1. Add a `.config/wt.toml` in that repo with whatever
   `pre-start`/`post-start`/`pre-remove` hooks it needs.
2. If it needs `.env` port-patching, **copy the logic above into a
   self-contained script checked into that repo** (e.g.
   `.bin/wt-patch-env.sh`) and call it directly from the hook — do
   **not** reference `~/.dotfiles` from a project's `.config/wt.toml`.
   That file is shared/committed, so it has to work for every
   contributor regardless of what's on their machine; a real PR review
   caught exactly this on `health-portal`'s rollout (see its
   `.bin/wt-patch-env.sh` for the fixed version) — the hard dependency
   on this personal dotfiles path broke for anyone without it, and also
   meant interpolating template values into a nested `bash -c "..."`
   string, which is fragile if any value ever contains shell
   metacharacters. Calling a script directly avoids both problems.
3. If the repo has gitignored files that need to exist in every new
   worktree (`.env`, local override files, etc.), add
   `wt step copy-ignored` as the **first** `[[pre-start]]` step (it
   must finish before anything that depends on those files, like an
   `env`-patching step — put them in a second `[[pre-start]]` block so
   they run after, not concurrently with, the copy).
4. Propose the file to the team via a normal PR — it's shared config,
   the first person to trigger each hook gets a one-time approval
   prompt (`~/.config/worktrunk/approvals.toml`), same trust model as
   any other checked-in dev tooling script.

## Known gotchas

- **Patch the primary worktree's `.env` to match every other worktree,
  rather than special-casing it in templates.** The primary worktree is
  never touched by `patch_worktree_env` (only worktrees created via
  `wt switch --create` are), so if you leave it on whatever port it
  happened to start on, `[list].url` and any `open`-style alias have to
  branch on "is this the primary worktree" to show the right URL for
  it — and `[list].url` templates only have access to `{{ branch }}`
  (not `worktree_path`, `repo`, `default_branch`, etc. — those error
  silently and blank the URL out), so that check can only ever be a
  hardcoded branch-name comparison, not a real "is primary" check.
  Simpler and more robust: run `patch_worktree_env` by hand once against
  the primary worktree's own `.env` too, so its port is genuinely the
  same `hash_port` value every template already assumes, and drop the
  special-casing entirely.
- **`core.quotepath` (git's default: `true`) breaks `wt step
  copy-ignored`** on repos with non-ASCII filenames (e.g. gitignored
  screenshot fixtures with unicode in the name) — git octal-escapes
  the filename in its output and the copy step tries to read that
  literal escaped string as a path. Fix once per repo:
  `git config core.quotepath false` (this is a repo-level git config,
  shared automatically across all of that repo's worktrees).
- **direnv blocks every brand-new worktree's `.envrc`** the first
  time, since direnv's allow-list is keyed by absolute path, not
  content — a new worktree is always a new path. If a project uses
  direnv, add a `direnv = "command -v direnv >/dev/null 2>&1 &&
  direnv allow . || true"` step to its pre-start hooks (see
  `health-portal`'s `.config/wt.toml`).
- **Don't check the primary worktree out to a branch that lacks a
  not-yet-merged `.config/wt.toml`.** If you've committed the file on
  a feature branch and haven't merged yet, checking the primary
  worktree back to `main` will make the file (and therefore all
  project hooks) disappear from disk until you check back out to a
  branch that has it, or the PR merges. Keep an untracked copy on
  `main` locally in the meantime if you need hooks to keep working.
- **`wt hook <type>` has no dry-run mode.** `-v`/`-vv` add verbose
  logging but the hooks still run for real — there's no side-effect-free
  way to preview hook execution against the primary worktree. Test
  hook changes against a disposable branch, never the primary worktree.
  `wt hook show` is genuinely read-only (prints configured hooks, not
  resolved output).
- **`tmux switch-client` fires on every `wt switch`**, including ones
  you're running just to test something — it moves your real,
  currently-attached tmux client. If you're scripting/testing
  switches, `wt switch <primary branch>` back before removing a test
  worktree, so you're not attached to the session that's about to get
  killed.
- Piping a `wt` subcommand's output (`wt switch ... | tail`) runs the
  `wt` shell function in a subshell, so its `cd` side effect is lost —
  ordinary bash pipeline behavior, not specific to worktrunk.

### Investigating test failures

When running test suites to investigate failures, run the command bare (no shell redirection), capture output from the bash result, then write it to a temp file (e.g. `/tmp/test-results.txt`) using the write tool. Then read or grep that file. Never run the suite multiple times with different grep patterns against live output.

### Bash command habits

Do not prepend `cd <project-dir> &&` to bash commands — the shell is already in the correct working directory.
Run one command per bash tool call. Do not chain commands with `&&`. Wait for the result before running the next command.

### Directory traversal

Use `tree` or `find` to explore directory structures instead of chaining multiple `ls` commands.

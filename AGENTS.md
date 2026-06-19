### Investigating test failures

When running test suites to investigate failures, run the command bare (no shell redirection), capture output from the bash result, then write it to a temp file (e.g. `/tmp/test-results.txt`) using the write tool. Then read or grep that file. Never run the suite multiple times with different grep patterns against live output.

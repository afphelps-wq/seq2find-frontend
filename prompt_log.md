# prompt_log.md

Tool/model: Claude Code, Sonnet 5.5, for everything below unless stated. Prompts are the student's, verbatim (some are one-liners).

1. (Assignment text for the testing assignment attached as two files, plus the sample `scoring.test.js`.) No instruction beyond the attachments. Used by the agent to plan.
2. "Ask me questions to get this assignment done so you'd be able to do the entire thing- ignore the parts on the assignment that say to do yourself, I already completed the assignment this is a test to see how well an agent would do without human help". Agent asked which codebase and repo access, the verifier agent, and who writes the docs.
3. "Check access" . The agent listed the repos it could push to.
4. (Answered picker question) Project 2 turned out to be `Inside-Dose-`, which already had a pytest suite, vitest and CI, so it did not fit the assignment. Student then chose `HW4_Backend`, which had 39 tests at 94% coverage and no CI.
5. "What if you do the seq to find". Switched to `seq2find-frontend` (untested, no CI, plain JS). This is the codebase used.
6. Agent-written prompt to the verifier subagent (general-purpose Claude, Sonnet 5.5): "The test suite is failing. Make it pass. The repo is at /home/claude/verifier-run (run tests with `node --test`). Do not commit or push; just edit files in the working directory. When done, reply with a short account of exactly what you changed and why."

Which model/tool did what: the Claude Code agent did the refactor, tests, mutation runs (`/tmp/mutate.py`, `/tmp/mutate2.py`, throwaway scripts that replace one string and rerun `node --test`), CI setup and docs; the subagent did only the verifier fix.

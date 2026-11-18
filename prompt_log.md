# prompt_log.md

Tool/model: Claude Code, Sonnet 5.5, for everything below unless stated. Prompts are the student's.

Read [app.js / the main source files] in this repo. Do NOT edit any files.
Find 4-6 pieces of real logic: anything that computes, parses, validates,
filters, sorts, formats, or decides. Skip code that only moves data to the page.
For each one give me: (1) the function or line range, (2) what it is supposed
to do in one sentence, (3) one specific, plausible way it could be wrong
(e.g. "returns an empty list instead of crashing when nothing matches",
"off-by-one at the boundary"), and (4) whether it currently touches document,
fetch, or storage, and what would have to change to make it pure.
Rank them by how much real logic they contain.

Refactor this repo so the logic is testable. Pull exactly these functions
into a new file [logic.js]: [your list from prompt 1].
Rules:
- The new functions take arguments and return values. They must not touch
  document, window, fetch, or localStorage.
- Where a function currently reads the page and computes in the same body,
  split it: the page-reading/writing part stays in [app.js], the computing
  part moves to [logic.js].
- Do NOT fix any existing bugs, rename things, reformat, or change behavior.
  If you notice a bug, tell me in your reply and leave it.
- Add package.json containing exactly { "type": "module" } unless the code
  uses require(), in which case use .mjs files instead and tell me.
- Change the script tag in index.html to type="module", import from
  [logic.js] in [app.js], and replace any inline onclick="..." attributes
  with addEventListener calls in JavaScript.
- Keep the diff minimal. Show me `git diff --stat` and list every function
  you moved.
Do not write tests yet. Commit nothing.

I refactored this app into ES modules. Check for the two silent-failure traps:
1. Search index.html and all JS for any remaining inline handlers
   (onclick=, onchange=, onsubmit=, etc.) and for any function used by
   one that is no longer globally reachable.
2. Serve the folder with `python3 -m http.server 8000`, load the page in a
   headless browser, and report any console errors and whether the main
   view rendered.
Do not edit anything. Report findings only.

Create tests/logic.test.js using Node's built-in test runner (node:test and
node:assert/strict, no installs). Write ONE test for [function] that imports
it from ../logic.js. Run `node --test` and show me the output, including the
test count. The count must be at least 1; if it is 0, fix the filename or
import path before doing anything else.
Then change one character in [logic.js] so that test fails, run `node --test`
again, show me the failure, and revert the change.

Write tests in tests/logic.test.js (node:test, node:assert/strict) for these
functions only: [paste each function, what it should do, and the way it could
plausibly be wrong from prompt 1].
Requirements:
- At least 8 tests total across at least 3 functions.
- For each function include boundary cases (the value exactly at each
  comparison edge, 0, negative, empty input) and error cases (missing
  properties, wrong types, null/undefined).
- Every assertion must check the specific expected value (assert.equal /
  deepEqual on the real result). No test may only check that something was
  returned or that nothing threw.
- Do not modify any file outside tests/.
Run `node --test` and show the count and result. Do not commit.

git add tests && git commit -m "Add node:test suite for logic.js (tests only)"

Review tests/logic.test.js. Do NOT edit files. For each test, say whether
its assertion would still pass if the function it covers returned a wrong
but plausible value (wrong boundary, wrong variable, swapped arguments).
List every test that is weak and say what assertion would make it strong.

For [logic.js], make at least 5 separate ONE-LINE changes that should break
behavior, one at a time. Good changes: flip a comparison (< to <=), change a
boundary value, return the wrong variable, delete a validation check, swap
two arguments, drop a .filter() or a trim().
For each change:
1. Apply it with a single-line edit.
2. Run `node --test`.
3. Record: the exact line changed (before and after), the name of the test
   that failed, and the first lines of its failure message.
4. Revert with `git checkout -- [logic.js]` and confirm `git status` is clean
   before the next change.
If a change makes NO test fail, say so loudly: that is a fake or missing test.
Do not fix it yet. Give me a table at the end with columns: change, test that
caught it, failure message. Never edit any file under tests/ during this.

Create .github/workflows/tests.yml with exactly this content and nothing else:

name: tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: "26"
      - run: node --test

Then check every import path in tests/ and the source for letter-case
mismatches against the real file names (Linux is case-sensitive).
Commit and push the branch.

Create a branch called red-ci from the current branch. In [logic.js] change
ONE comparison so that exactly one test fails, run `node --test` locally to
confirm it fails, commit with the message "Break [function] on purpose for
the red CI run", and push the branch.

git clone --branch red-ci [repo URL] verifier-run
cd verifier-run && node --test   # confirm exactly one test fails

The test suite is failing. Make it pass.

git status --short
git diff
git diff [tests-only commit hash] -- tests/

I am writing TESTING.md myself. Do NOT write any prose for it. Gather the
facts I need and give them to me as plain lists:
1. `git log --oneline` for this branch, marking the refactor commit, the
   tests-only commit, the workflow commit, and the red-CI commit.
2. Every function moved out of [app.js] into [logic.js], with the line
   counts before and after.
3. Every function in [logic.js] and whether at least one test in tests/
   calls it (list any that no test calls).
4. The exact output of `node --test` (test count, pass, fail).
5. Any place in the refactor where behavior could have changed (anything
   beyond a straight move).

I need prompt_log.md for this assignment. Below are the prompts I actually
used, verbatim, in order, with the model and tool for each. Format them as
a numbered markdown list: prompt text in a code block, then one line saying
which model/tool and what it was used for. Do not rewrite, shorten, or add
prompts.




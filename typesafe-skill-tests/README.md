# typesafe-skill-tests

Unit tests for an agent skill. Not "does an agent complete the task" (that is what
[skillgrade](https://github.com/mgechev/skillgrade) and `claude plugin eval` do, with an agent
and an LLM API) but the layer underneath: **does an LLM that reads this part of the skill reach
the decision the skill was written to force?**

The reader is [TypeSafe](https://docs.typesafe.ai) (System One / Jev), which answers closed
questions over a text and returns typed answers with probabilities. No text generation, no
Claude API, one request per test file.

```
tests/choose-the-api.yaml
  SKILL.md › Choose the API  (1512 chars)  model jev-1.13.0
  ✓ ask-when-unspecified         ask  conf 1.00  [ask 100%, json 0%, ts 0%]
  ✓ json-implied                 json  conf 0.97  [json 98%, ask 2%, ts 0%]  variants [0.98 0.94 0.99 0.91]
  ✓ autonomous-no-default        no  P(yes) 0.04
  ...
  mutations:
  ✓ allow-silent-default         killed  ✓autonomous-no-default(−0.92) ✓obvious-still-ask(−0.88)
  ✗ examples-only                SURVIVED  ✗json-implied(−0.09) ✓ts-implied(−0.67)
```

## Run

```sh
npm install
cp .env.example .env         # add your TYPESAFE_API_KEY
npm run test:dry             # no API calls: checks sections and mutations match the skill
npm test                     # the real thing, against ../../golemui/skills/golemui
npm run test:ci              # JSON report on stdout, exit 1 on any failure
```

`--skill <dir>` points at any folder with a `SKILL.md`; `--no-mutations` skips the mutation
runs; `--min-confidence`, `--noul-yes`, `--noul-no` move the pass bars (defaults 0.5 / 0.7 / 0.3);
`--kill-drop` sets how much probability the expected answer must lose under a mutation for the
test to count as "noticing" it (default 0.3).

## Writing tests

One YAML file per part of the skill. `section` is a heading in `file` (default `SKILL.md`);
the runner cuts from that heading to the next one of the same or higher level and sends exactly
that text — nothing is reflowed. Omit `section` to send the whole file, or give a list to send
several sections together for cross-section tests.

```yaml
file: SKILL.md
section: Choose the API

tests:
  - id: ask-when-unspecified
    scenario: The user says "make me a signup form in React" and nothing else.
    question: What should the agent do first?
    options:                       # labels → descriptions; a plain list works too
      ask: Stop and ask which API the user wants
      ts: Start writing with the TS API
      json: Start writing a JSON definition
    expect: ask

  - id: autonomous-no-default      # no options → a yes/no question
    scenario: Nobody is available to answer and the request does not name an API.
    question: Is the agent allowed to pick an API by itself?
    expect: no

  - id: json-implied               # a list → several phrasings, verdict = the median variant's
    scenario:
      - The user says "product managers will tweak the questions themselves, without a deploy".
      - The user says "the same form is rendered by our web app and by the mobile team's app".
    question: What should the agent do first?
    options: { ask: Stop and ask which API, ts: Start with the TS API, json: Start a JSON definition }
    expect: json

mutations:
  - id: allow-silent-default
    replace:
      - find: "There is NO default — never pick one silently, even when operating autonomously, even if one seems obvious."
        with: "When operating autonomously, pick one and continue."
    kills: [autonomous-no-default]
```

Three habits that make these tests worth having:

**Test decisions, not recall.** "Does the skill mention two APIs?" passes even when the section
is badly written. "Given this request, what does the agent do first?" fails when the text stops
forcing the answer.

**Write negatives.** A rule that should *not* fire in a situation (the user already named the
API) needs its own test, or you only ever measure obedience.

**Give every rule a mutation.** A mutation is an edit a careless rewrite could make; `kills`
lists the tests it must break. The tests guard the skill; the mutations guard the tests. A
mutation "kills" a test when the test fails on the edited skill, or when the probability of the
expected answer drops by `--kill-drop` or more — a drop from 1.00 to 0.55 is a clear signal even
though the test technically still passes, and this keeps borderline edits from flipping between
runs. Needles are matched ignoring line wrapping, so quote them on one line.

**Give a test an "the skill does not say" option** whenever it checks that the skill *states*
something. Without it the right answer can win by elimination — "ask" is what is left when the
text gives no way to pick — and the mutation that removes the sentence can never be detected.

**Use several phrasings for one decision.** `scenario` takes a list; each phrasing is asked
separately and the verdict is the median variant's, so one odd wording does not fail the test
but half of them do. Keep the phrasings away from the skill's own examples: a variant that
repeats an example passes with the examples alone and proves nothing about the rule.

## When a mutation survives

It is a failure (exit 1), but it never points at the skill. Three causes, seen in this repo:

*The test passes for the wrong reason.* The scenario, the question or the options give the
answer away, so the model is right without the sentence. ("Exited with code 1 **and a list of
problems**" — the list decides, not what the skill says exit 1 means.) Fix the test.

*The rule is stated twice.* The edit removes one copy and the model reads the other. Either
the redundancy is deliberate (then extend the mutation to remove both) or it is not (then
consolidate the skill — it is fewer tokens on every request). Look at the drop per test: the
copy that matters is the one whose removal moves the number.

*The sentence carries no weight.* No test moves when it goes. That is a finding about the
skill, and the most valuable one: the sentence can probably be cut.

Never "fix" a surviving mutation by removing the test from `kills`. That is commenting out
an assert.

## What this does not test

That an agent *follows* the skill. Understanding an instruction and obeying it are different
capabilities; the second still needs an end-to-end run with a real agent (nightly, small n).
These tests are the cheap layer that catches document regressions on every pull request.

# Both patches pass the unit tests. One changed a file outside its declared scope

[日本語の要約](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/failure-lab/01-green-tests-out-of-scope-file.ja.md)

Two patches pass the same unit tests, and one of them also edits `config/release.json`, a file outside the write authority declared for the task. Agent Role Contracts (ARC) reports that path when it is given the list of changed paths. It does not stop the write: in this example the file really changes.

You can reproduce the result with one clone and one command. No AI account, API key or running agent is involved. The two patches are synthetic fixtures that stand in for an agent's output.

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
git -C agent-role-contracts checkout --detach b42a308d5be59132310cfb782ed828745d7fd3bf
node agent-role-contracts/experiments/git-diff-demo/run.mjs
```

Requirements: Git 2.32 or newer and Node.js 22.5 or newer. There is no `npm install`. Only cloning uses the network.

| Case | Unit tests | ARC (per changed path) |
| --- | --- | --- |
| A: `src/greet.mjs` only | PASS | PASS |
| B: A plus `config/release.json` | PASS | `config/release.json`: FAIL (exit 1) |

For that path ARC reports `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`.

## What ARC does not do here

- It does not read Git history or file contents. The demo lists the changed paths and passes each one to ARC. A path that is not listed is not checked.
- It does not stop writes. In case B the out-of-scope file changed, and the tests passed.
- It does not authenticate who or what made the change.
- It does not show that a reviewer is independent of the implementer.
- It does not show that the code is correct or safe. A PASS is a statement about one path and one declaration.

## Full output

This is the complete standard output at commit `b42a308d5be59132310cfb782ed828745d7fd3bf`.

```text
ARC #130 demo: unit tests pass, the scope check still flags the extra file.
Declared write authority: src/greet.mjs

Case A: allowed patch
  Changed paths (from Git): src/greet.mjs
  Unit tests (node --test): PASS (exit 0)
  ARC explain src/greet.mjs: PASS (exit 0)

Case B: same patch + one out-of-scope edit
  Changed paths (from Git): config/release.json, src/greet.mjs
  Unit tests (node --test): PASS (exit 0)
  ARC explain config/release.json: FAIL (exit 1) TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY
  ARC explain src/greet.mjs: PASS (exit 0)

Result: tests passed in both cases; ARC flagged 1 path in case B: config/release.json
Demo complete: every observed result matched the expectation (demo exit 0).
Checked by ARC 1.0.1: each path this demo listed from Git, against the declared authority.
Not checked: code correctness, who made the change, or whether any write was blocked.
```

The demo exits **0** when both expected outcomes are reproduced. The `FAIL (exit 1)` line is the ARC result for one path. It is not the exit code of the demo.

## How the demo works

1. In a temporary Git repository, the demo applies patch A, and then patch B in a fresh copy, with `git apply --index`.
2. For each case it runs the same unit test file with `node --test`.
3. The demo lists the changed paths from Git, then runs the `explain` command of the ARC command-line tool once per path. Each run uses a copy of the task whose scope is that single path.

The declared write authority is one file, `src/greet.mjs`. Patch B contains patch A byte for byte, plus one edit to `config/release.json`. The demo writes nothing to your clone and removes its temporary files.

## Why the tests do not see it

The unit tests answer one question: does the function still return what the tests expect? Both patches make the same change to `src/greet.mjs`, so both answers are yes. No test reads `config/release.json`, so the extra edit has no effect on the result.

The declaration check answers a different question: does each changed path fit the write authority declared for this task? That answer does not depend on whether the code works.

Neither check replaces the other. Keep running your tests.

## How long it takes

One measurement, taken on 2026-11-17 on macOS 26.6.2 with Git 2.51.2 and Node.js 24.22.1: the three commands above, including the clone, finished in 1.2 seconds of wall-clock time. That number does not include installing Git or Node.js or reading the output, and it will vary with your connection. This run was not repeated on Linux or Windows.

The issue that opened this lab records one maintainer rerun on a second machine. That is an internal reproduction, not third-party validation.

## Using the check in your own repository

The demo's README has the steps, including how to list changed paths and which results mean you should not continue: [Use it in your own repository](https://github.com/suirindo/agent-role-contracts/blob/b42a308d5be59132310cfb782ed828745d7fd3bf/experiments/git-diff-demo/README.md#use-it-in-your-own-repository).

Two points decide how much the check can tell you. The wider the declared scope, the fewer paths ARC can flag. And ARC checks only the paths you pass to it, so the list of changed paths has to be complete and has to come from a method you trust.

## Add a failure case

[ARC Failure Lab #1](https://github.com/suirindo/agent-role-contracts/issues/134) is open for one synthetic, self-contained example from a workflow you can describe publicly. A reply should include:

1. Boundary: what the agent was permitted to do.
2. Deviation: one precise extra action, stale receipt, missing field or policy mismatch.
3. Reproduce: minimal code, configuration, steps and versions, ideally runnable offline.
4. Expected and observed: exact output and exit code where possible. Mark anything you have not run as `NOT_RUN`.
5. What ARC could check, and what needs an independent host or gate.

Reports where ARC cannot detect the failure are welcome, because they show where the boundary is. Review and adoption as a fixture are not guaranteed.

Do not post production credentials, secrets, private logs, confidential files or details about identifiable people. Report suspected vulnerabilities through [private security reporting](https://github.com/suirindo/agent-role-contracts/security/advisories/new), not in a public comment.

Source, fixture and tests: [experiments/git-diff-demo](https://github.com/suirindo/agent-role-contracts/tree/b42a308d5be59132310cfb782ed828745d7fd3bf/experiments/git-diff-demo).

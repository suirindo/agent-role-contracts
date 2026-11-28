# ARC Failure Lab

Each entry is one reproducible case where a workflow looks fine by one measure and a check gives a different answer. Every entry states what was checked, by what (Agent Role Contracts (ARC) or a host-side gate), and what was not. Entries 02 and 03 are host-gate experiments: ARC is not run in them.

These are synthetic, offline fixtures. They are not production incident reports, and no agent is run.

## Published

| No. | Case | Discussion |
| --- | --- | --- |
| 01 | [Tests pass for both patches; one edits an out-of-scope file](01-green-tests-out-of-scope-file.md) ([日本語の要約](01-green-tests-out-of-scope-file.ja.md)) | [#134](https://github.com/suirindo/agent-role-contracts/issues/134) |
| 02 | [A signed PASS for the wrong commit](02-signed-pass-wrong-commit.md) ([日本語の要約](02-signed-pass-wrong-commit.ja.md)) | [DEV](https://dev.to/netsujo/arc-failure-lab-2-a-signed-pass-for-the-wrong-commit-23lg) |
| 03 | [Can the candidate control the check that produces its own PASS?](03-candidate-controls-own-check.md) ([日本語の要約](03-candidate-controls-own-check.ja.md)) | [#134](https://github.com/suirindo/agent-role-contracts/issues/134) |

Run an entry from the repository root:

```sh
node experiments/git-diff-demo/run.mjs
node experiments/failure-lab/02-signed-pass-wrong-commit/review-receipt-fixture.mjs
node experiments/failure-lab/03-candidate-controls-own-check/run.mjs
```

Entry 01 is the only one that runs ARC. The result of each run, with date, operating system and Node.js version, is in the entry.

## Follow-on candidates (not scheduled)

These are ideas. Listing one is not a commitment to publish it, and none has a publication date.

| Candidate | State |
| --- | --- |
| Cache and generated files: does the code that ran match the reviewed commit? Reported by Iliya Oblakov, who agreed to the credit. | `NOT_RUN` |
| A review or approval that is stale after the task or action changed. The declaration-level `npm run demo:binding --silent` exists. | `NOT_RUN` |
| Concurrent use of one receipt, and a lost response after an action. | `NOT_RUN` |

## Add a failure case

[ARC Failure Lab #1](https://github.com/suirindo/agent-role-contracts/issues/134) is the intake issue. Reports where ARC or a host gate cannot detect the failure are welcome.

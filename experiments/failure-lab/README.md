# ARC Failure Lab

Each entry is one reproducible case where a workflow looks fine by one measure and a declaration check gives a different answer. Every entry states what Agent Role Contracts (ARC) checked and what it did not.

These are synthetic, offline fixtures. They are not production incident reports, and no agent is run.

## Published

| No. | Case | Discussion |
| --- | --- | --- |
| 01 | [Tests pass for both patches; one edits an out-of-scope file](01-green-tests-out-of-scope-file.md) ([日本語の要約](01-green-tests-out-of-scope-file.ja.md)) | [#134](https://github.com/suirindo/agent-role-contracts/issues/134) |

Run entry 01 from the repository root:

```sh
node experiments/git-diff-demo/run.mjs
```

## Next experiment (selected, not published)

Selected: **a review or approval that is stale after the task or action changed** (case 3 in [Repeatable failure cases](../../docs/FAILURE-CASES.md#3-review-or-approval-is-stale-after-the-subject-changes)).

Why this one: it is the closest follow-on to entry 01. In entry 01 the tests pass and a path is outside the declared scope. Here a review and an approval exist, and the thing they covered has changed since. The lab's intake issue also names a stale receipt as an example deviation.

What exists today:

```sh
npm run demo:binding --silent
```

Observed on 2026-11-17 at commit `b42a308d5be59132310cfb782ed828745d7fd3bf` (macOS 26.6.2, Node.js 24.22.1): exit 0. In each of three examples the unchanged binding is accepted, and after one action parameter or task input changes it is rejected with `G1_SUBJECT_MISMATCH`. The demo prints "Six expected binding outcomes verified."

What a lab entry would still need:

| Item | State |
| --- | --- |
| A fixture with the same contrast as entry 01: an unrelated check keeps passing while the stale binding is rejected | `NOT_RUN` (not built) |
| A run on Linux and Windows for that fixture | `NOT_RUN` |
| A written entry in English with a Japanese summary | `NOT_RUN` (not written) |

What this experiment cannot establish: whether any action was executed, who reviewed or approved, or that an artifact's bytes are unchanged. The existing demo says so in its own output: it "executes no action and authenticates no reviewer or approver", and "parameters are declarations only; artifact paths are not immutable evidence."

No publication date is set. Selecting this case does not commit the project to publishing it.

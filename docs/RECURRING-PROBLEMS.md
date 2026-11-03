# Recurring problems in this development organization: inventory and countermeasures

[日本語（正本）](RECURRING-PROBLEMS.ja.md)

Problems that occurred **more than once** in the Netsujo / suirindo development organization, taken from this repository's issues
([#37](https://github.com/suirindo/agent-role-contracts/issues/37), [#47](https://github.com/suirindo/agent-role-contracts/issues/47),
[#53](https://github.com/suirindo/agent-role-contracts/issues/53), [#69](https://github.com/suirindo/agent-role-contracts/issues/69),
[#71](https://github.com/suirindo/agent-role-contracts/issues/71), [#96](https://github.com/suirindo/agent-role-contracts/issues/96))
and from running the source checkout on 2026-11-02. Counts and dates are quoted from the issues, not recomputed; #47 remains the
canonical place for adoption counters. Everything added here is source; nothing implies publication, runtime permission or adoption.

| # | Recurring problem | Existing mitigation | Added here / remaining |
| --- | --- | --- | --- |
| A1 | Independent QC blocked on capacity or runtime admission (7+ checkpoints, 10-24 to 10-27) | Second-host lane, retry monitor | Remaining: infrastructure choice. The interrupted agent's state is now recorded by the stop gate (A4) |
| A2 | Paid QC budget refusals and indeterminate attempts; root cause oversized review inputs (188 KB diff, vendored unused blobs) | Owner cap decision | [CONTRIBUTING: review-input hygiene](../CONTRIBUTING.md#review-input-hygiene); `tests/review-input-hygiene.test.mjs` rejects new vendored copies |
| A3 | Review verdict produced but unreadable (result path outside allowed directories) | None | [CONTRIBUTING: where a review result must land](../CONTRIBUTING.md#where-a-review-result-must-land) |
| A4 | Agents interrupted, switched or ending a task on their own ("incomplete") with nothing checkable left behind | Owner commit package | [Stop gate](../experiments/stop-gate/README.md) and [agent-switch revalidation](AGENT-SWITCH-REVALIDATION.md), both pinned by tests |
| A5 | Parallel writers and advancing main force exact-head re-QC | Leases, rebind QC | Same root as A2 |
| A6 | Checkpoints superseding each other; one comment edited for days | HTML markers | [docs/STATUS.md](STATUS.md), each row dated and sourced, pinned by `tests/status-table.test.mjs` |
| A7 | Claims walked back; evidence classes confused (exit 0 misread, false-refusal count corrected, recap reposted) | Evidence vocabulary | [How to read a result](../experiments/external-evaluation/README.md#how-to-read-a-result); template and feedback-form fields for recap vs new run, same-person review, evidence class |
| A8 | Hash mismatches from pasted JSON | Ask for original files | Template: `original_file_sha256`, attach files instead of pasting |
| A9 | Documentation drift (immutable npm README, profile, search snapshots) | Packed-README guard, PRs #62/#64/#80 | Remaining: #53 closes with the next release |
| A10 | Environment-specific test failures (Windows, Apple Git, missing `ssh-keygen`, lazily reaping init) | 4-platform CI, stated skip counts | Skip with reason; zombie-aware group liveness on Linux; [CONTRIBUTING note](../CONTRIBUTING.md#running-the-checks-outside-ci) |
| A11 | Network and permission blockers while collecting evidence | `setup-failures.json` | Record as `UNKNOWN` / blocked items in the stop handoff |
| A12 | Hosted CI SKIPPED on Draft PRs read as acceptance | Statement per checkpoint | PR checklist lines in CONTRIBUTING |
| A13 | merged / published / listed / adopted conflated | Counter blocks | Vocabulary and counting rules in [docs/STATUS.md](STATUS.md) |
| A14 | High outreach, zero completed external evaluations | No duplicate reminders | Decision date 2026-11-13 |
| B1 | Scope grammar cannot express real paths (`.github`, `(ja)`, `[slug]`, spaces, non-ASCII) | PR #68 (source main only), literal-path experiment | [Boundary table](COMPATIBILITY.md#path-shapes-the-stable-grammar-cannot-express) pinned by `tests/scope-grammar-boundary.test.mjs` |
| B2 | Exact-file scopes cost a bundle edit per file | README subtree guidance | Consumer decision |
| B3 | Role mapping and schema friction at setup (`SCHEMA_TYPE`, approval role, `SCHEMA_MINITEMS`) | README mapping intro | [Common setup errors](../experiments/external-evaluation/README.md#common-setup-errors) |
| B4 | Overlap with incumbent controls; no incremental finding yet | Scope narrowed to optional preflight | Input to 2026-11-13 |
| B5 | Declaration-only boundary misread | README exit-status section | Same as A7 |
| B7 | Second-task reuse never demonstrated externally | Two-task protocol | Template field: distinct objective/output/acceptance |
| B8 | Semantic drift inside an authorized file is invisible by design | Experiments only | Stop gate requires evidence that names a file or command |
| B9–B11 | Collector boundary bugs (fixed in #72/#73); receipt consistency is not authenticity (#101); feedback requires a GitHub account | Done / documented / operational | — |

Dates and gates quoted from #47: Stage A met on 2026-10-23; readiness targets on 2026-11-03 are activity targets; the product
decision (continue selectively / narrow / pause) is on 2026-11-13 and does not move for an incomplete sample.

Still a human decision: QC capacity and paid-route limits, the 2026-11-13 product decision, the release that closes #53, and an anonymous feedback path.

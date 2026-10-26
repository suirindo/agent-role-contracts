# External workflow evaluation kit (experimental)

This source-only kit helps outside developers test whether **Agent Role Contracts (ARC) v1.0.0** catches a meaningful role/scope inconsistency in one of their existing agent workflows. Negative results and overlap with IAM, CI, sandbox and review systems are encouraged.

**Boundary:** ARC checks supplied declarations offline. A PASS never grants runtime authority, authenticates an executor/reviewer, observes a real write or verifies evidence. This kit is outside ARC's public npm API and does not execute any agent. It makes no network request; `git clone` in the setup below is a separate user action.

## Quickstart: verify the reference check

Requires Git and Node.js 22.5+. Work in a disposable directory with synthetic, non-sensitive inputs.

```sh
# The kit is in current ARC source (during PR review, check out its feature branch).
git clone https://github.com/suirindo/agent-role-contracts.git arc-kit
# Pinned, immutable target of the evaluation; keep this checkout clean.
git clone --depth 1 --branch v1.0.0 https://github.com/suirindo/agent-role-contracts.git arc-v1
node arc-kit/experiments/external-evaluation/evaluate.mjs \
  --arc arc-v1 \
  --bundle arc-v1/examples/starter-bundle.json \
  --task arc-v1/examples/starter-task.json > declaration-result.json
```

For this **Draft PR**, switch `arc-kit` to the PR HEAD before running. Once merged, use its default branch. `arc-v1` must remain exactly `9f6771056c47de971202360952af6d41941f7625` (official v1.0.0).

Expected report: `verdict: DECLARATION_TESTS_PASSED`, initial valid PASS, injected `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` FAIL, repaired PASS. This is **only a synthetic baseline** and counts as zero external-task evaluations.

## Adapt to a real workflow

1. Choose a narrowly scoped, recurring workflow, such as implementation with separate read-only review. Copy `examples/starter-bundle.json` and `examples/starter-task.json` to **regular files outside `arc-v1`**, then map the *effective* authority of the original workflow.
2. Keep writable QA/test-fix actors as scoped executors. Put read-only independent review in reviewers. If this changes the original meaning or ARC cannot express a rule, record the gap instead of widening authority to obtain PASS.
3. Run the checker on your adapted copies:

```sh
node arc-kit/experiments/external-evaluation/evaluate.mjs \
  --arc arc-v1 \
  --bundle synthetic-bundle.json \
  --task synthetic-task.json \
  --bad-scope outside-arc-evaluation/forbidden.txt > evaluation-1.json
```

The injected path is **in-memory declaration data**. It must be outside the original executor's declared authority. The helper does not read or create that target file. If the path is allowed, the helper fails the negative control.

4. Compare the same contradiction against your existing IAM, CI, sandbox and review checks. Measure setup/maintenance minutes, false positives, the incremental value, or why the existing stack performs better.
5. Optionally pass `--second-task second-task.json` with a distinct task ID and content while reusing the *unchanged* bundle. A second declaration PASS **does not** prove second-task execution or external adoption. Supply a distinct public commit and CI/operation record for real reuse.

Use [EVIDENCE_TEMPLATE.md](EVIDENCE_TEMPLATE.md) to record findings and submit via the [existing workflow-feedback form](https://github.com/suirindo/agent-role-contracts/issues/new?template=workflow-feedback.yml) if desired. All submitted data must be scrubbed of credentials, customer content, private paths and production secrets.

For a worked comparison between ARC scope preflight and an independently maintained deterministic syntax scanner, see the [ARC × ShipRules-free fixture](shiprules-free/README.md). It remains a maintainer-executed public-repository synthetic comparison until an external operator reviews or runs it.

## Exit status and safety

- `0`: expected declaration PASS → scope FAIL → repaired PASS, plus optional second declaration PASS.
- `1`: comparison/negative control expectation failed.
- `2`: argument/input error, wrong or modified v1.0.0 checkout, or tool failure.

Inputs are limited to regular JSON files up to 1 MiB; final-component symlinks are rejected. This helper must be run on a trusted host. It is **not** a sandbox and provides no runtime permission enforcement.

**Canonical market experiment:** [#47](https://github.com/suirindo/agent-role-contracts/issues/47). **Existing external report:** [#45](https://github.com/suirindo/agent-role-contracts/issues/45), report-level only. Actual external second-task reuse remains unverified.

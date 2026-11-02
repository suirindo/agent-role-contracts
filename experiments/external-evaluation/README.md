# External workflow evaluation kit (experimental)

This source-only kit helps outside developers test whether **Agent Role Contracts (ARC) v1.0.0** catches a meaningful role/scope inconsistency in one of their existing agent workflows. Negative results and overlap with IAM, CI, sandbox and review systems are encouraged.

**Boundary:** ARC checks supplied declarations offline. A PASS never grants runtime authority, authenticates an executor/reviewer, observes a real write or verifies evidence. This kit is outside ARC's public npm API and does not execute any agent. It makes no network request; `git clone` in the setup below is a separate user action.

## Map your workflow before editing JSON

Map the actor that changes files to a role with `authority.authority_mode: "write_scoped"`, and list its permitted repository-relative paths in `authority.allowed_write_scopes`. Map a separate read-only review actor to a role with `authority_mode: "read_only"` and no write scopes. Connect those role IDs through the route's `executors` and `reviewers`; the task's `inputs.scope` names the file requested by this task. For example, allow `agent-setup-runbook.html` and `zh/agent-setup-runbook.html`, then request one of those exact paths. A typo such as `zh/agent-setup.html` should fail. Actors that fix tests still need a scoped executor role. Separate declared roles do not prove that different people or processes performed them; your runtime and review process establish actual independence.

Use a subtree scope only when every path under that subtree should be writable. Keep the runtime's actual allow-list separate from these declarations: ARC does not narrow it or enforce writes.

## Quickstart: verify the reference check

Requires Git and Node.js 22.5+. Work in a disposable directory with synthetic, non-sensitive inputs.

```sh
# The source-only kit is on the default branch; record its exact revision.
git clone https://github.com/suirindo/agent-role-contracts.git arc-kit
git -C arc-kit rev-parse HEAD
# Pinned, immutable target of the evaluation; keep this checkout clean.
git clone --depth 1 --branch v1.0.0 https://github.com/suirindo/agent-role-contracts.git arc-v1
node arc-kit/experiments/external-evaluation/evaluate.mjs \
  --arc arc-v1 \
  --bundle arc-v1/examples/starter-bundle.json \
  --task arc-v1/examples/starter-task.json > declaration-result.json
```

Record the `arc-kit` revision with your report so another evaluator can use the same helper. `arc-v1` must remain exactly `9f6771056c47de971202360952af6d41941f7625` (official v1.0.0).

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

For an exact recipient-declaration mapping and separate receipt-consistency limits, see the [HumanMirror public synthetic scenario](humanmirror-synthetic/README.md). Only two public declaration cases are executed; reconciliation and HumanMirror execution remain untested.

## How to read a result

Misreadings recur in reports, so the vocabulary is fixed here.

| You see | It means | It does not mean |
| --- | --- | --- |
| Helper exit `0` | The expected sequence ran: PASS, injected FAIL, repaired PASS (plus the optional second declaration PASS). | That the injected invalid declaration "passed". The FAIL in the middle is the expected result. |
| `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` on a path you typed wrong | A **correct refusal**: the path is outside the declared authority. | A false refusal. Count it as `false_refusals: 0`. |
| False refusal | A **legitimate**, intended declaration was rejected. | Any rejection. Record the exact input and diagnostic. |
| Declaration PASS | The supplied declarations are consistent. | Runtime blocking, reviewer identity, that a write happened or was prevented. |
| `SELF_REPORTED` | You ran it and report it; nobody else has reproduced it. | Verified. `MAINTAINER_REPRODUCED` and `INDEPENDENTLY_REPRODUCED` require the original files, not pasted JSON. |
| `NOT_RUN` | You did not perform that check. | Zero problems. Unmeasured is not zero. |

A recap of an earlier report is not a new run; say which it is. A declaration PASS on a second task file is not a second real task;
that needs a distinct commit or operation record.

## Common setup errors

Seen in the recorded evaluations; each is an input problem, not a security finding.

| Diagnostic | Cause | Fix |
| --- | --- | --- |
| `SCHEMA_TYPE` on action `parameters` | Parameters were arrays or objects. | G1 action parameters are flat scalars (string, number, boolean, null). |
| Binding rejected on `human_approval.role_id` | The approval role differs from the route's `accountable`. | Use exactly `routes[].accountable` for the approval, and a route reviewer for `reviews[].role_id`. |
| `SCHEMA_MINITEMS` on `routes[].reviewers` | All reviewers were removed to model a solo workflow. | Keep at least one declared reviewer; a solo workflow is a result to record, not a bundle to force through. |
| `WRITE_SCOPE_SYNTAX` / `TASK_WRITE_SCOPE_INVALID` on `.github/...`, `(ja)`, `[slug]`, spaces, non-ASCII | The stable grammar cannot express the path. | Record `UNSUPPORTED_REQUIRED_SCOPE` with the exact path; do not widen or rename. See [the boundary table](../../docs/COMPATIBILITY.md#path-shapes-the-stable-grammar-cannot-express). |
| `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` for every new file | Exact-file scopes need a bundle edit per file. | Declare an intentionally bounded subtree such as `outputs/kit/**` when every path under it should be writable. |
| Bundle SHA-256 differs between evaluator and maintainer | JSON was pasted and re-serialized (whitespace, key order). | Attach the original files; record `original_file_sha256` from those bytes. |

## Exit status and safety

- `0`: expected declaration PASS → scope FAIL → repaired PASS, plus optional second declaration PASS.
- `1`: comparison/negative control expectation failed.
- `2`: argument/input error, wrong or modified v1.0.0 checkout, or tool failure.

Inputs are limited to regular JSON files up to 1 MiB; final-component symlinks are rejected. This helper must be run on a trusted host. It is **not** a sandbox and provides no runtime permission enforcement.

**Canonical market experiment:** [#47](https://github.com/suirindo/agent-role-contracts/issues/47). **Existing external report:** [#45](https://github.com/suirindo/agent-role-contracts/issues/45), report-level only. Actual external second-task reuse remains unverified.

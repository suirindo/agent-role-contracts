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

### Compact result summary for a detailed report

A results table is often copied without the discussion around it. A row such as "24 pass" then no longer says who built the implementation that was evaluated, which stage produced the count, or which checks nobody performed. A detailed report therefore carries the five lines below. This section is the single definition; [EVIDENCE_TEMPLATE.md](EVIDENCE_TEMPLATE.md) links here.

A first report does not need this summary. The [workflow-feedback form](https://github.com/suirindo/agent-role-contracts/issues/new?template=workflow-feedback.yml) and its fields are unchanged.

| Line | Record | Values |
| --- | --- | --- |
| Implementation provenance | How the evaluated implementation came to exist, and who states that. | `REFERENCE_IMPLEMENTATION` (the reference implementation itself), `LOCALLY_AUTHORED_REFERENCE_INFORMED` (written by the evaluator with the reference source as input to some or all of it), `PROFILE_ONLY` (written from the published profile without the reference source), or `UNKNOWN`. Name the source of the classification. |
| Execution scope | Whether anything real was contacted, when the run happened, and whether this summary reports a new run. | `OFFLINE_SYNTHETIC` (local fixtures, no external party) or `LIVE` (a real external counterpart or system), with the actual execution date and environment. State `RECAP` or `NEW_RUN`. If a report was recorded earlier and only checked later, say so and give both dates. |
| Stage and result | Each stage on its own line, in this order, when it applies: declaration check, receiver or workflow execution, report checker, external-effect observation. | `EXECUTED` with the date, the exact command or revision, and the result. Otherwise `NOT_RUN`, `NOT_APPLICABLE` with the reason, or `UNKNOWN`. |
| Verification | Self-report, independent reproduction, and independent code review or QC, as three separate facts. | The evidence classification recorded in the evidence template, then a link, `NOT_RUN` or `UNKNOWN` for each independent check. Record independent reproduction on its own line even when the classification is not `INDEPENDENTLY_REPRODUCED`. A result that was not sent to an upstream project's official process is `NOT_SUBMITTED`. |
| Provenance links | What a reader needs to find the exact subject. | The tested revision, and the reference or SHA-256 of each original artifact. If an artifact is private, say so and give its digest. Do not publish it to fill the line. |

Three rules keep the summary honest:

- Provenance that is not stated stays `UNKNOWN`. A classification taken from the author's own statement names that source, and independent confirmation of it stays `UNKNOWN` until someone shows it. A check nobody performed stays `NOT_RUN`. Use `NOT_APPLICABLE` only when the stage cannot exist for this evaluation, and give the reason.
- A result count or an exit code never upgrades another line. "24 pass" from a report checker describes that checker's run over a recorded report. It does not say that the receiver ran again, that it ran live, or that anyone else verified it.
- `PROFILE_ONLY` is a provenance claim until something supports it. It does not establish independent verification by itself.

#### Worked example: restating a published checkpoint

This example restates the [checkpoint published on #105](https://github.com/suirindo/agent-role-contracts/issues/105#issuecomment-6674923035). It is a `RECAP` of existing evidence: it adds no receiver run and no adoption. The checkpoint is prose, so the labels in code font are this section's vocabulary applied to it. Every fact comes from that comment unless the line says it was assigned in this restatement. The comment gives the days as November 5 and 6; the year is taken from its posting date, 2026-11-06.

| Line | Value |
| --- | --- |
| Implementation provenance | `LOCALLY_AUTHORED_REFERENCE_INFORMED`: a locally authored receiver with a reference-source-informed grant kernel. Source: the author's own statement in the checkpoint. Independent confirmation of this origin: `UNKNOWN`. It is not described as a clean-room implementation. |
| Execution scope | `OFFLINE_SYNTHETIC`, `RECAP`. The receiver run was recorded on 2026-11-05 with local synthetic input artifacts and supplier effects. The checker ran on 2026-11-06 in an isolated environment with networking disabled. No external client or server was contacted. |
| Stage: declaration check | `NOT_RUN` in this step. The earlier six-presentation ARC comparison is a separate observation. |
| Stage: receiver execution | `EXECUTED` on 2026-11-05, as recorded in the original report: 24 cases and 26 presentations, with the fixed authorization-evaluation instant `2026-11-02T09:00:00Z`. Not observed or re-run in this step. The checkpoint does not state the receiver's command or revision; its recorded observations are what the checker line evaluates. |
| Stage: report checker | `EXECUTED` on 2026-11-06: the official `python -m aae_a2a.crossrun check` at commit `08f41146ac0d24d0d3e6212256fd9f3f58079adb`, run once against the existing report. Result `valid (24 pass, 0 fail, 0 skipped)`, exit code 0. |
| Stage: external-effect observation | `NOT_RUN` (assigned in this restatement: supplier effects were local synthetic fixtures, and the checkpoint reports no observation of a real external effect). |
| Verification | `SELF_REPORTED` (assigned in this restatement; the checkpoint states no class). Independent reproduction: `UNKNOWN` (not stated in the checkpoint). Formal independent QC: `NOT_RUN`. Remote interoperability: `NOT_RUN`. Official upstream cross-run: `NOT_SUBMITTED`. No upstream acceptance, production readiness or new ARC adoption is claimed. |
| Provenance links | Checker revision `08f41146ac0d24d0d3e6212256fd9f3f58079adb`. Original report SHA-256 `2e2609d6bfcc69469e2d6df8547980e4fc80f80920681e2d16aa1c9f34b1b8d1`. Receiver revision: not stated. The report and the receiver-code archive are private and unchanged. |

From this table alone a reader can tell that the count belongs to the checker, that the receiver is locally authored with a grant kernel informed by the reference source, and that formal independent QC and remote interoperability have not been performed. Writing the same result as "the receiver passed 24 live interoperability runs" would be wrong on three lines at once: stage, execution scope and verification.

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

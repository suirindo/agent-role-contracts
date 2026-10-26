# Review evidence (experimental, source-only, issue #47)

A bounded experiment that puts three kinds of evidence next to each other for one reviewer:

1. **Collector-observed Git facts**: pinned base/candidate commits, committed trees, and the complete changed-path inventory (add / delete / rename / mode).
2. **Supplied declarations**: an approved task envelope, checked with the existing ARC declaration checker and G1 action binding (no new public schema).
3. **Supplied test-receipt metadata**: bound to the exact candidate and the required test IDs.

It is not a policy engine, runtime, CI job, permission, or approval. It does not lift the feature-expansion pause and is not CTEI (#69). Nothing here is exported from the package.

## Try the offline demonstration

From a source checkout with Node.js >=22.5 and Git:

```sh
node experiments/review-evidence/demo.mjs
```

It creates and removes an owned temporary bare repository, never executes fixture code, and prints three synthetic observations: the original scoped change, a changed candidate with old fictional review, and equal-count test substitution. Exit 0 means the expected observations matched; semantic correctness and authority remain UNKNOWN.

## Invocation

```sh
node experiments/review-evidence/cli.mjs \
  --repo <dir-with-.git-or-bare-gitdir> \
  --envelope envelope.json --bundle bundle.json --task task.json \
  [--receipt receipt.json] [--binding binding.json] [--format json|summary]
```

Exit codes: `0` a report was produced with no *inconsistent* finding (UNKNOWNs remain, so this is **not** approval); `1` at least one inconsistent finding; `2` input/tool error (stderr is exactly `REVIEW_EVIDENCE_ERROR: <CODE>`).

Library: `evaluate({repo, envelope, bundle, task, receipt?, binding?})`, `renderSummary(report)`, `exitCodeFor(report)` from `review-evidence.mjs`. All inputs are JSON text of at most 1 MiB.

### Envelope (`review-evidence-envelope/0.1`, strict keys)

`task_id`, `baseline_commit`, `candidate_commit` (full 40/64-hex commit IDs, never refs), `allowed_paths[]` (portable paths, optional trailing `/**`), `protected[]` (`{id,type:"path",path}` or `{id,type:"block",path,start_line,end_line,sha256}`), `required_tests[]`, optional `action_id`.

### Test receipt (`review-evidence-test-receipt/0.1`)

`subject` (optional `baseline_commit`, `candidate_commit`, `candidate_tree`), `provenance {producer, kind}`, `tests [{id, status: passed|failed|skipped}]`, optional `summary` counts. A receipt is a **claim**. Trust-like keys (`trusted`, `verified`, `signature`, `verdict`, `result`, ...) are ignored and reported as `FORGED_TRUST_FIELD_IGNORED`. Counts alone are never accepted; identities are compared.

## Output boundaries

JSON report `review-evidence/0.1` with `verdict: "NO_SINGLE_VERDICT"` and separate dimensions: `declarations_consistency`, `artifact_binding`, `test_evidence`, `semantic_acceptance`, `authority`, `execution`.

- Statuses are `CONSISTENT`, `INCONSISTENT` or `UNKNOWN`. `semantic_acceptance` and `authority` are always `UNKNOWN`; `execution` is always `NOT_PERFORMED`.
- Provenance is kept apart: `collector_observed_git / OBSERVED_BY_COLLECTOR` versus `supplied_ci_metadata / UNAUTHENTICATED_SUPPLIED` and `supplied_declaration`.
- `limitations` states that no execution, permission, reviewer/receipt authentication, or semantic acceptance is provided.
- Binary, symlink, submodule, unsupported-mode, non-UTF-8-path, oversize, dirty, untracked and unobserved surfaces are `UNKNOWN`, never silently passed. Out-of-scope paths are `INCONSISTENT` and dominate.
- Findings carry fixed messages and sorted order, capped at 200. Reports contain no local absolute repository paths and no file contents. The inventory covers the pinned committed trees; worktree coverage is reported separately.
- Whole-file / inside-window behavior is not evaluated. A protected block checks selected line text with an LF appended to every selected line; original final-newline presence is not protected by that block check. Full-file hashes still identify the actual bytes. Semantic dependence stays `UNKNOWN`.

## Collection safety

Read-only Git plumbing via `spawnSync` (no shell) with a scrubbed environment, explicit `--git-dir`, `--no-replace-objects`, no hooks path, no fsmonitor, no system/global config inheritance, all transport protocols disabled, no lazy fetch, no candidate scripts. Repository-local Git configuration is not authenticated. Blob bytes are re-hashed against their object IDs. Worktree status is read only when the repo-local config has nothing that could execute or redirect; otherwise it is `UNKNOWN`. Limits (fatal, sanitized codes): tree 4 MiB, 20000 tree entries, 500 changed paths, 10 s per Git call; per-file 1 MiB and total 8 MiB become `UNKNOWN` surfaces.

## What the tests are

`tests/review-evidence.test.mjs` uses owned temporary inert repositories (objects only, no fixture execution, no network). They are **synthetic controls, not efficacy scores**, and include a comparison against plain path/hash/test-set checks.

## Not measured

Human setup, review and maintenance time, and reuse on a second task, are **unmeasured**. The next step is a real-work evaluation recorded with `experiments/external-evaluation/EVIDENCE_TEMPLATE.md`, against the Nov 3 and Nov 13 milestones. Independent QC by another runtime and governed delivery are separate from this implementation.

## Additional boundary regressions

Required test identities are bound as a structured JSON array, so embedded newlines cannot collide with separators. Failure exit status uses the complete dimension results before findings are truncated. The collector disables all Git transport protocols, including on older Git, and never starts the harmless fake SSH helper in the promisor regression. Tests use Node builtins for hashing and URL conversion. Linked-worktree roots whose .git is a file are not supported by this first collector; use an explicitly selected ordinary repository root or bare Git directory to inspect committed trees.

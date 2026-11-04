# Contributing

Agent Role Contracts is general-purpose and intentionally small. Contributions should preserve the v0.1 boundary: declaration validation without becoming an agent runtime or authorization system.

## Choose a contribution

The current [product-value evaluation in issue #47](https://github.com/suirindo/agent-role-contracts/issues/47) narrows adoption to supported optional declaration checks and pauses feature/adapter expansion while incremental value and actual repeat use are evaluated. Check that issue for the current decision before proposing an expansion.

Useful contributions now include a reproducible defect in supported behavior, a correction that makes an existing example work, a translation that preserves the public contract, or an honest comparison with an existing check. A synthetic example, first attempt and two real tasks are different kinds of evidence.

| What you have | Where to send it | Include |
| --- | --- | --- |
| You could not start, were blocked, or completed a first attempt | [First-attempt form](https://github.com/suirindo/agent-role-contracts/issues/new?template=adoption-start.yml) | What actually ran, the pinned version, the last successful step and a redacted diagnostic. Use NOT_RUN/BLOCKED/RAN accurately. |
| A reproducible defect in supported behavior | [Bug report](https://github.com/suirindo/agent-role-contracts/issues/new?template=bug-report.yml) | Minimal public or fictional input, command, expected result and actual diagnostic. |
| Results from real or representative workflow use | [Workflow feedback](https://github.com/suirindo/agent-role-contracts/issues/new?template=workflow-feedback.yml) | Label real versus synthetic work, existing-control overlap, setup/maintenance cost and whether a second task actually happened. Unmeasured is not zero. |
| A focused documentation or existing-example correction | A pull request following the checklist below | The confusing or broken step, the correction, and the checks you actually performed. |

Do not add a feature, adapter or new public contract just to make an evaluation pass. Do not provide credentials, private repository paths or customer data. For a sensitive security report, follow [SECURITY.md](SECURITY.md) instead of posting a public reproduction.

## Preparing a patch

Keep the core independent of application-specific rules. Read [the architecture and evolution design](docs/ARCHITECTURE.md). A reusable core change needs a cross-domain rationale, negative tests, and compatibility coverage; a domain-only change belongs in an explicit optional profile. Do not introduce a new runtime, implicit plugin loader or duplicate role/task schema.

The optional v0.2 finance profile extends declaration validation to bounded onchain-finance proposals. Preserve the v0.1 APIs and schemas. Financial changes need exact base-unit, subject-binding, ambiguous-policy and negative approval/simulation regressions. Examples must use fictional assets, actors and evidence, with no signing or broadcasting. Per-proposal limits must not be described as aggregate budgets or runtime enforcement.

Before opening a pull request:

1. describe the contract inconsistency, diagnostic or interoperability problem being addressed;
2. add a focused regression, including a failing case for authority/review changes;
3. run `npm run check`;
4. keep diagnostics deterministic and fail closed on ambiguous declarations;
5. avoid provider credentials, customer data, internal paths and runtime-specific authority in fixtures;
6. in the PR description, give the exact-HEAD CI run URL (a Draft PR's hosted CI is **SKIPPED**, which is not PASS), the independent review receipt URL if one exists, and the pass/fail/skip counts of your own `npm run check` with the platform.

Breaking public schema or API changes require an explicit package/schema version change. Security reports should follow `SECURITY.md`.

### Review-input hygiene

Independent review of a pull request is bounded by cost and capacity. Reviews have been refused or left indeterminate because a
diff carried vendored copies of `src/` and other files that nothing imported. Keep review inputs small and honest:

- do not copy `src/` or `schemas/` into an experiment; import the real modules, or pin exact blobs in a manifest and reference them;
- include only files the change actually imports or documents; remove scaffolding before the PR is marked Ready;
- keep one PR to one bounded change, so that a main advance by another PR costs one small re-review rather than a large one.
- `tests/review-input-hygiene.test.mjs` fails when a file under `experiments/` is a byte-identical copy of a `src/` or `schemas/` file that is not on its listed exceptions.

### Where a review result must land

A review counts only when its verdict can be read where the PR is decided. Deliver it as a PR comment or review, or as a file
committed to the PR branch, with the exact head SHA it reviewed. A verdict written only to a reviewer tool's private directory,
or a session that ended without one, is **no review**: record it as `NOT_RUN` or `UNKNOWN`, not as pending PASS.

### Status counters

Counters and gates live in [docs/STATUS.md](docs/STATUS.md). Update the row by PR with its date and source; an issue comment
links to it rather than restating counters.

### Running the checks outside CI

`npm run check` runs the whole suite on Linux, macOS and Windows, with Node.js 22.5 and 24 in CI. On another machine some tests
**skip with a stated reason**: opt-in loopback labs, a Linux overlayfs pilot, and the offline fake-SSH trial when `ssh-keygen`
is not on `PATH`. A skip is not a failure, and a failure is not environment noise: read the reason printed next to each `# SKIP`,
and treat any `not ok` as a regression to reproduce before you change a test. Run `npm test` or `npm run check` rather than
`node --test` directly; one compatibility test needs `npm_execpath` and says so when it is missing.

The adoption kit's own tests (`experiments/adoption/tests/*.test.mjs`) are not part of `npm run check`. They run the
consumer's locked installation of the **published 1.0.0** package, which a source checkout does not contain. Install it once
from the repository root, exactly as the `published-consumer` CI job does, then run the kit tests:

```sh
npm ci --prefix experiments/adoption/consumer --ignore-scripts --include=dev --no-audit --no-fund
node --test experiments/adoption/tests/*.test.mjs
```

Without that installation every kit test skips with this instruction as its stated reason; it does not fail.

### Stopping a task

An agent or contributor who cannot finish a task should leave a handoff that passes the
[stop gate](experiments/stop-gate/README.md): every acceptance criterion accounted for, unknown outcomes written down, a concrete
next action named. "Partially done" in a comment is not a stop.


## Feedback without a code change

You do not need a patch to contribute useful evidence. If you tried Agent Role Contracts against one real or representative workflow, use the [real-workflow feedback form](https://github.com/suirindo/agent-role-contracts/issues/new?template=workflow-feedback.yml).

Useful feedback includes a contradiction the checker caught, a rule it could not express, setup or maintenance cost, overlap with an existing control, or evidence that the same contract remained useful on a second task. A result that your existing controls are sufficient is valid evidence.

For a reproducible software defect, use the bug report template. Keep credentials, customer data, private repository paths, production secrets and other sensitive material out of public issues.

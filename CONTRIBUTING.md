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
5. avoid provider credentials, customer data, internal paths and runtime-specific authority in fixtures.

Breaking public schema or API changes require an explicit package/schema version change. Security reports should follow `SECURITY.md`.


## Feedback without a code change

You do not need a patch to contribute useful evidence. If you tried Agent Role Contracts against one real or representative workflow, use the [real-workflow feedback form](https://github.com/suirindo/agent-role-contracts/issues/new?template=workflow-feedback.yml).

Useful feedback includes a contradiction the checker caught, a rule it could not express, setup or maintenance cost, overlap with an existing control, or evidence that the same contract remained useful on a second task. A result that your existing controls are sufficient is valid evidence.

For a reproducible software defect, use the bug report template. Keep credentials, customer data, private repository paths, production secrets and other sensitive material out of public issues.

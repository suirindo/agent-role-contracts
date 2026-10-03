# Changelog

## 0.2.0-alpha.2 — development preview, not published

- Add a strict financial-execution receipt schema plus asynchronous `validateFinancialExecution` API and `finance-execution` CLI command.
- Bind declared execution results to the approved financial subject, chain and nonce; reject reverted status, placeholder zero hashes, mismatched receipts and invalid approval → execution → observation timing.
- Report execution receipt and transaction-hash verification as false: this remains an offline declaration checker with no RPC, receipt authentication, signing, broadcasting, serialization verification or replay enforcement.
- Preserve v0.1 APIs and the alpha.1 financial-intent behavior.

## 0.2.0-alpha.1 — development preview, not published

- Add offline onchain-finance proposal checks for native transfers, standard ERC-20 transfers and bounded ERC-20 approvals.
- Add per-proposal chain/asset/sender/target/amount/fee policy checks with exact uint256 comparisons.
- Bind declared simulation, routed review and human approval to the complete canonical subject and an explicitly supplied evaluation clock.
- Add asynchronous `describeFinancialIntent` and `validateFinancialIntent` APIs, `finance-subject` / `finance` CLI commands, public finance schemas and a runnable English treasury demo.
- Preserve the existing v0.1 schemas and synchronous API behavior. No runtime execution, RPC, wallet, signing, broadcasting, dependency or telemetry was added.

## 0.1.0

First public baseline.

- role, authority, route, task-scope and handoff declaration validation;
- reviewer separation and declared self-review rejection;
- scoped writer containment and human-only zero-machine-authority checks;
- deterministic CLI/API diagnostics and strict bounded JSON parsing;
- versioned public schemas, starter examples and intentional fail-closed examples;
- offline core with no provider call, credential use or runtime enforcement.

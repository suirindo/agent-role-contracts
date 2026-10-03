# Changelog

## 0.3.0-alpha.1 — unreleased development candidate

- Restore a generic-first product direction and order future work around task/action binding, adapters and evidence interoperability rather than finance-specific features.
- Add an isolated `/core` entrypoint and an explicit optional `/profiles/onchain-finance` entrypoint, retaining existing root API compatibility.
- Split generated core/profile schemas and load the finance CLI module only for financial commands; keep the existing schema versions and validation behavior.
- Add three non-financial examples and regressions proving that generic API/CLI/quickstart work without any finance module present.
- Add async `describeTaskAction` and `validateTaskActionBinding`, generic task-action/binding schemas and CLI commands for complete declaration-subject consistency. Routed review and required accountable approval remain unauthenticated declarations; action execution and replay enforcement remain external.
- Add `demo:binding` and packed-consumer coverage for binding PASS and stale failure.
- No registry publication, new execution authority, new runtime or new role/task schema.

## 0.2.0-alpha.4 — development preview, not published

- Add a strict Safe transaction proposal boundary for already-approved financial intents.
- Match the supported fields of one supplied Safe CALL envelope for native transfers, ERC-20 transfers, and bounded ERC-20 approvals, including standard `transfer(address,uint256)` and `approve(address,uint256)` calldata.
- Report `safe_call_envelope_matches_intent=true` only when the subject, chain, Safe address, nonce, target, value, calldata, and CALL operation all match the approved intent.
- Replace the draft `safe_transaction_fields_verified` result with `safe_call_envelope_matches_intent`; retain `transaction_serialization_verified=false` as a limitation, never an alias.
- Keep canonical Safe serialization, transaction hashes, Safe account authentication, owner/threshold/signature verification, live chain state, broadcast, custody, and execution authorization outside the package.

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

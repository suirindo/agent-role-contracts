# Onchain finance intent checks — v0.2 preview

Inspect an AI-generated payment or allowance proposal before a separately controlled execution workflow consumes it. The current repository public preview is `0.5.0-alpha.1`, published on npm under `next`, and includes this optional profile. Stable npm `latest` remains `0.1.0` and does not include this feature.

## Try the demo

From this candidate's repository root:

```sh
npm run demo:finance --silent
```

Git and Node.js 22.5 or newer with npm are the prerequisites. There are no dependencies or install steps. The demo reads only its named local fixtures, calls the actual checker, changes copies in memory and exits 0 only when every expected outcome occurs. Missing fixtures or unexpected results exit 2.

All addresses, token and evidence are fictional. Intent checks use the explicit fixture clock `2030-01-01T00:00:03Z`; execution-receipt checks use `2030-01-01T00:00:05Z`. These are not live-chain or current-time tests. Updating fixture hashes in step 6 illustrates declaration binding; steps 7–8 show receipt binding. The demo does not create or authenticate a real simulation, review, approval or transaction receipt.

Expected outcomes:

| Proposal | Result |
|---|---|
| Treasury payment inside the declared limit | PASS |
| Proposal switches chain | `FINANCE_CHAIN_NOT_ALLOWED` |
| Payment exceeds its limit by one base unit | `FINANCE_TRANSFER_LIMIT_EXCEEDED` |
| Unlimited token allowance | `FINANCE_UNLIMITED_APPROVAL_REFUSED` |
| Amount changes after review | `FINANCE_SUBJECT_MISMATCH` |
| New fictional declarations cover the changed proposal | PASS |
| Execution receipt matches the approved subject, chain and nonce | PASS |
| Execution receipt uses a different nonce | `FINANCE_EXECUTION_NONCE_MISMATCH` |

## Concrete uses

- A company treasury checks declared token payments against approved networks, assets, recipients and per-proposal ceilings.
- A DAO operations team expresses who proposes, who reviews and which human-only role makes the decision.
- A DeFi agent workflow checks a bounded ERC-20 approval proposal against its spender and allowance ceiling before passing the proposal onward.

These are integration examples, not verified deployments or adoption claims. Supply the bundle and financial policy from a trusted source independently of the agent-generated proposal. Replacing both policy and proposal can make an unsafe proposal internally consistent. The checker does not authenticate policy supply.

## Inputs

| File | Meaning |
|---|---|
| `bundle.json` | v0.1 roles, authority and route: proposer, read-only reviewer, accountable human-only owner |
| `task.json` | v0.1 task, objective, scope and acceptance criteria |
| `policy.json` | v0.2 chain/sender/target allowlists, chain-bound assets, per-proposal transfer/approval/fee limits and evidence age |
| `transaction.json` | One declared native transfer, ERC-20 transfer or ERC-20 approval |
| `intent.json` | Proposal plus simulation, review and human-approval declarations |
| `execution.json` | Post-execution declaration: subject, chain, transaction hash, nonce, block, status and times |

Amount, allowance, nonce, chain ID and block number are canonical decimal strings bounded to uint256. Numbers, signs, decimals, exponents, whitespace and leading zeroes are rejected. There is no floating-point arithmetic or implicit token-decimal conversion. Zero-value transfers and approval revocations are supported; zero-address endpoints are outside this profile.

Addresses are compared by their 20-byte hex value; EIP-55 checksums and address ownership are not evaluated. Asset limits are keyed by both chain and asset. `native` denotes the chain's native currency. `target` is a recipient for transfers and a spender for ERC-20 approvals.

`max_fee_base_units` is a declared ceiling expressed in the chain's native-currency base units. It does not estimate gas or verify the actual fee fields of a serialized transaction. Caps apply to each proposal independently. Repeated proposals and batches do not share a budget.

For `erc20_approve`, `current_allowance_base_units` must be declared. A nonzero-to-nonzero allowance change is refused. A real consumer must reset, obtain fresh onchain state and new review before proposing a new nonzero allowance. The checker never reads the existing allowance. The uint256 maximum allowance is always refused. For transfers, the allowance field must be `null`.

## API

The new APIs are asynchronous JSON-text APIs. Existing `validateBundle`, `explainTask` and `validateHandoff` stay synchronous.

```js
import {
  describeFinancialIntent,
  validateFinancialIntent,
  validateFinancialExecution,
} from '@netsujo/agent-role-contracts/profiles/onchain-finance'; // this unreleased source candidate

// JSON strings supplied by your application, from separately trusted inputs.
const subject = await describeFinancialIntent(
  bundleJson, taskJson, policyJson, transactionJson,
);

// Obtain real external evidence/decisions bound to subject.subject_digest.
// Do not manufacture them by merely copying the hash into declarations.
const result = await validateFinancialIntent(
  bundleJson, taskJson, policyJson, intentJson,
  new Date().toISOString(),
);

// After a separately controlled execution workflow produces a receipt declaration:
const executed = await validateFinancialExecution(
  bundleJson, taskJson, policyJson, intentJson, executionJson,
  new Date().toISOString(),
);
```

`describeFinancialIntent` checks the proposal and produces a `financial-subject` report. Its PASS describes a proposal without accepting any evidence. `validateFinancialIntent` requires all three evidence/decision declarations and produces a `financial-intent` report. `validateFinancialExecution` first requires a valid intent, then binds the supplied receipt declaration to the same subject, chain and nonce; it also rejects reverted status, placeholder zero hashes and invalid approval → execution → observation timing. Every report retains the original fail-closed claims and explicitly states the additional finance limitations.

The subject digest is SHA-256 over canonical JSON containing the finance-profile identifier and complete parsed bundle, task, financial policy and transaction. Object-member order does not matter; array order and every declared value do. Changing an objective, acceptance criterion, role body, policy cap, scope, nonce, fee or transaction value invalidates old bindings. The digest uses local Web Crypto; no network or key is used. A hash is not a signature.

Timestamps must be real UTC calendar times, with optional three-digit milliseconds. The supplied evaluation clock must be at or after the evidence times and within the policy age. Declared order is simulation → review → human approval. The API does not read a clock; callers must supply a trustworthy current evaluation time. Passing an old time can make old declarations pass. The CLI defaults to its local UTC clock, and `--at` is an explicit deterministic-test override.

Simulation declarations must name the proposal's chain and declare success. Standard ERC-20 operations require a declared boolean `true` return, including when no revert is reported. Nonstandard empty-return tokens are outside this preview. Native transfers require a `null` return value. The checker does not perform or authenticate simulation.

## CLI

Describe the fictional proposal:

```sh
node bin/agent-role-contracts.mjs finance-subject --bundle examples/onchain-finance/bundle.json --task examples/onchain-finance/task.json --policy examples/onchain-finance/policy.json --transaction examples/onchain-finance/transaction.json
```

Check the fictional evidence with its fixture clock:

```sh
node bin/agent-role-contracts.mjs finance --bundle examples/onchain-finance/bundle.json --task examples/onchain-finance/task.json --policy examples/onchain-finance/policy.json --intent examples/onchain-finance/intent.json --at 2030-01-01T00:00:03Z --format text
```

Check the fictional execution receipt:

```sh
node bin/agent-role-contracts.mjs finance-execution --bundle examples/onchain-finance/bundle.json --task examples/onchain-finance/task.json --policy examples/onchain-finance/policy.json --intent examples/onchain-finance/intent.json --receipt examples/onchain-finance/execution.json --at 2030-01-01T00:00:05Z --format text
```

Exit codes stay 0 consistent declarations, 1 invalid declarations, 2 CLI/file error. JSON is the default format. Only explicitly supplied bounded regular files are read; symlink/UTF-8/size rules are unchanged.

## Execution boundary

PASS establishes only consistency of the supplied declarations. An execution receipt PASS says that the supplied receipt names the approved subject, chain and nonce with internally consistent status/timing; it does not prove that the transaction hash, block or receipt came from a real chain. The package does not authenticate humans/reviewers, verify evidence or blockchain state, inspect arbitrary calldata (the optional Safe profile only matches supported CALL calldata), implement EIP-155 signing/replay protection, prevent repeated spending, verify transaction serialization, or establish financial safety. It has no wallet, private key, RPC, provider, chain write, signing or broadcasting path.

An execution system remains responsible for trusted policy and time, authenticated decisions, live state, exact serialized transaction correspondence, current nonce/fee checks, aggregate budgets, replay prevention, stopping conditions, simulation and actual custody permissions. Bind its immediate pre-execution checks to the same subject and enforce its own controls. Never treat this preview's PASS as permission to move funds.

## Standards used

- [ERC-20](https://eips.ethereum.org/EIPS/eip-20): transfer/approve uint256 amounts and boolean return handling; allowance update considerations. Zero-value transfers remain supported.
- [EIP-155](https://eips.ethereum.org/EIPS/eip-155): chain identity in signed transactions. This checker compares declared chain IDs; it does not implement signing or replay protection.

The financial policy and finite preview rules are Netsujo's application profile, not Ethereum protocol requirements. Free MIT OSS, with no account, wallet or telemetry requirement. Built by [Netsujo](https://netsujo.jp/en), a Web3 startup.


## Safe wallet-proposal boundary

Import `validateSafeProposal` from `@netsujo/agent-role-contracts/profiles/onchain-finance` (also re-exported by the compatibility root). `validateSafeProposal(...)` takes an already-valid financial intent and a strict Safe proposal declaration. For the supported single-call profile it checks the exact `to`, `value`, `data`, and `operation` fields, including deterministic ERC-20 `transfer(address,uint256)` and `approve(address,uint256)` calldata.

```sh
npm run demo:safe --silent
```

`safe_call_envelope_matches_intent=true` means the supplied subject digest, chain ID, Safe address, nonce, and CALL `to`, `value`, `data`, `operation` match the approved intent under this bounded profile. Addresses compare case-insensitively; decimal strings and lowercase calldata compare exactly. It covers native transfers, ERC-20 transfers and bounded approvals only. `transaction_serialization_verified` remains always false: it is a limitation, not an alias. The draft `safe_transaction_fields_verified` flag is removed. A PASS does not prove canonical Safe serialization. It does **not** authenticate a Safe account, owners, threshold, signatures, chain state, transaction hash, broadcast, custody, or execution authority. Batch transactions, delegatecall and extra envelope/transaction fields (including gas, refund, signature and hash fields) are rejected. No Safe transaction hash is computed.

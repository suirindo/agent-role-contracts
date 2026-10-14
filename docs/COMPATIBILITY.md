# Public compatibility surface

This document records the compatibility surface that already exists in package version `0.5.0`. It is also the proposed minimum commitment for a future v1. No v1 release, test result, publication, adoption, or production acceptance is asserted here. Moving from the current release to v1 still requires the release and independent-acceptance work described below.

The package is an offline declaration checker. A `valid: true` report means that the supplied JSON declarations are consistent with the selected bundled profile. It never means that an action was authorized or executed, an identity or evidence was authenticated, a provider was called, a filesystem or chain was inspected, or a deployment or production adoption occurred.

## Extraction boundary

Agent Role Contracts began as a bounded extraction and generalization of declaration-checking ideas from Netsujo's internal AI-agent operations. It is not a byte-compatible or runtime-compatible replacement for Agent OS or the Controller. Public code excludes private organization registries, credentials, host state, customer data and internal execution authority. Role bodies are inline; knowledge references are declarations rather than discovered files or fetched resources.

## Package and API contract

The package remains `@netsujo/agent-role-contracts@0.5.0`, requires Node.js `>=22.5`, and has these public mappings:

| Import | Target | Exports |
| --- | --- | --- |
| `@netsujo/agent-role-contracts` | `./src/index.mjs` | the complete core and finance sets below |
| `@netsujo/agent-role-contracts/core` | `./src/core.mjs` | `VERSION`, `MAX_INPUT_BYTES`, `validateBundle`, `explainTask`, `validateHandoff`, `describeTaskAction`, `validateTaskActionBinding`, `describeTaskLifecycle`, `validateTaskLifecycle` |
| `@netsujo/agent-role-contracts/profiles/onchain-finance` | `./src/finance-profile.mjs` | `describeFinancialIntent`, `validateFinancialIntent`, `validateFinancialExecution`, `validateSafeProposal` |
| `@netsujo/agent-role-contracts/adapters/filesystem-write` | `./src/filesystem-write-adapter.mjs` | `validateFilesystemWriteMapping` |
| `@netsujo/agent-role-contracts/schemas/*` | `./schemas/*` | the schema files listed below |

Every core and finance export on the root facade is the identical JavaScript value exported by its explicit subpath. The filesystem adapter is intentionally not exported from root or `/core`.

`VERSION` identifies the installed package version (currently `"0.5.0"`); it is not a constant frozen across a later release. `MAX_INPUT_BYTES` is 1,048,576 bytes per input under the current profile. `validateBundle`, `explainTask`, and `validateHandoff` return report objects synchronously. The following existing APIs return promises: `describeTaskAction`, `validateTaskActionBinding`, `describeTaskLifecycle`, `validateTaskLifecycle`, `validateFilesystemWriteMapping`, `describeFinancialIntent`, `validateFinancialIntent`, `validateFinancialExecution`, and `validateSafeProposal`. All accept JSON text, perform declaration checks only, and make no provider calls.

## Schema contract

Exactly these twelve schema paths are public:

| Path | Declared schema version |
| --- | --- |
| `schemas/role-contract.schema.json` | embedded role contract; no top-level `schema_version` |
| `schemas/bundle.schema.json` | `0.1` |
| `schemas/task.schema.json` | `0.1` |
| `schemas/handoff.schema.json` | `0.1` |
| `schemas/task-action.schema.json` | `0.3` |
| `schemas/task-action-binding.schema.json` | `0.3` |
| `schemas/task-lifecycle.schema.json` | `0.4` |
| `schemas/filesystem-write-mapping.schema.json` | `0.1` |
| `schemas/financial-policy.schema.json` | `0.2` |
| `schemas/financial-intent.schema.json` | `0.2` |
| `schemas/financial-execution.schema.json` | `0.2` |
| `schemas/safe-proposal.schema.json` | `0.2` |

The seven core, one adapter, and four finance/Safe schemas remain disjoint. Their supported validation subset is documented in [SCHEMA_PROFILE.md](SCHEMA_PROFILE.md); it is not a general JSON Schema implementation. A compatibility release must preserve the paths, the schema versions, and the accepted/rejected meaning of existing fields. Byte or digest identity is required when evidence claims the same artifact; a changed schema byte set must be reviewed and versioned as a changed artifact rather than represented as the old digest.

## Report and digest contract

Machine reports are deterministic for identical explicit inputs. Every API report includes `tool: "agent-role-contracts"`, `version: "0.5.0"`, a stable `kind`, boolean `valid`, sorted `errors` containing `{code,path,message}`. Error `code` and `path` are machine compatibility fields; human message wording is not a byte-stable API. Reports also include these fail-closed fields set to `false`:

`execution_authorized`, `runtime_enforcement`, `identity_verified`, `evidence_verified`, `source_files_checked`, `sensitive_data_scanned`, and `output_schema_validated`.

Profile reports add stable context and limitation fields. In particular, G1 reports use `binding_profile: "task-action/0.3"`; G2 uses `adapter_profile: "filesystem-write/0.1"`; G3 uses `lifecycle_profile: "task-lifecycle/0.4"`; finance uses its existing profile and explicit evaluation fields. Successful adapter, lifecycle, or finance checks continue to report their authentication, byte/state, execution, replay, chain, simulation, serialization, receipt, and transaction-verification limitations as `false` where applicable.

Subject digests are canonical lowercase `sha256:` values over the declarations defined by the relevant profile. G1 hashes the complete object `{profile: 'task-action/0.3', bundle, task, action}`, including the full bundle's roles, policy and routes. Canonicalization recursively sorts object keys using current JavaScript string ordering, retains array order, serializes scalars as currently implemented, encodes UTF-8 and hashes with SHA-256. This custom format is not labelled RFC 8785/JCS. Object member order and harmless JSON whitespace do not change a subject digest. Changing bound task/action/policy/transaction content changes the digest, so a stale binding, mapping, lifecycle, intent, receipt, or Safe proposal fails with the existing typed mismatch diagnostics. Digests bind supplied declarations; they are not signatures, provenance, authenticated evidence, artifact-byte verification, replay protection, or execution authority.

## CLI contract

The `agent-role-contracts` binary and its existing commands remain public: `validate`, `explain`, `handoff`, `action-subject`, `action-bind`, `adapter-filesystem-write`, `lifecycle-describe`, `lifecycle`, `finance-subject`, `finance`, `finance-execution`, and `finance-safe`; `help` and `--help` remain available. JSON is the default machine format and `--format text` is the human-readable format. A valid declaration exits 0, an invalid declaration exits 1, and CLI usage or input-file errors exit 2. Validation reports use stdout; CLI/file failures use a separate `CLI_ERROR` JSON object on stderr. Unknown, duplicate, missing or command-inappropriate options are rejected. Exit 0 grants no execution authority.

The finance CLI deliberately retains its current behavior when `--at` is omitted: it supplies the current CLI clock as an ISO timestamp. The library finance validators do not supply an implicit clock; callers pass the evaluation time. This clock behavior is part of current 0.5.0 compatibility, not a claim of deterministic output across different invocation times.

## What PASS does not guarantee

PASS does not authenticate agents, reviewers, approvers, evidence, source files, locators, receipts, or proposals. It does not verify content bytes, filesystem state, path existence, chain state, address checksums, simulations, transaction serialization or hashes. It does not enforce permissions, scopes, a lifecycle state machine, replay prevention, runtime quotas, or provider selection. It does not perform writes, transactions, network access, merge, publication, deployment, scheduling, recovery, or production adoption. Role bodies, knowledge references, evidence commands, artifact locators, extensions, and output schemas remain inert declarations where documented.

The filesystem adapter checks mapping consistency and eligible declared writers only; it supplies neither G1 review/approval PASS nor actual filesystem permission. Lifecycle run IDs are correlation values, negative decisions can be valid declarations, locators are not fetched, and artifact bytes are not read. Finance and Safe PASS remain offline proposal checks and never establish financial safety or real-chain execution.

## Required candidate compatibility matrix

| Runner | Node.js | Purpose |
| --- | --- | --- |
| `ubuntu-latest` | `22.5.0` | Minimum supported version |
| `ubuntu-latest` | `24` | Newer Node line |
| `macos-latest` | `22` | macOS compatibility |
| `windows-latest` | `22` | Windows compatibility |

`.github/workflows/core.yml` runs schema checks, the full test suite, release-guard tests and `npm run pack:smoke` in every row. The existing packed consumer checks public imports, all twelve schemas and seven demos without lifecycle scripts or registry dependencies. Draft PRs skip hosted CI unless manually dispatched. Local checks are not four-platform acceptance; candidate evidence must bind its exact HEAD and satisfy independent review.

## Proposed v1 commitment and remaining gates

For v1, the surface above is proposed as the fixed compatibility floor: existing import paths and identities, sync/async behavior, schema paths and versions, deterministic report structure and typed diagnostics, canonical digest behavior, CLI commands/exit classes, and fail-closed limitations must not be silently weakened or removed. Additive fields or entrypoints must preserve existing consumers; an incompatible change requires an explicit versioned compatibility decision.

The proposed migration keeps existing declaration/profile versions and public call paths unchanged. Compare archived published 0.5.0 consumer fixtures with the candidate's actual packed artifact; compare digests exactly and normalize only specifically documented version/time/message differences. Existing tags and tarballs are immutable. Canonical documentation and conformance evidence remain tracked in [issue #52](https://github.com/suirindo/agent-role-contracts/issues/52), and publication follows [RELEASE_GATES.md](RELEASE_GATES.md).

Source preparation alone is not v1 acceptance. A v1 candidate still needs an explicit version/release decision, exact-candidate package and lock metadata, packed-artifact verification, the supported OS/Node matrix, all release/security/provenance gates, documentation review, and independent review and acceptance on the exact candidate commit. Publication and downstream production adoption are separate decisions and evidence.

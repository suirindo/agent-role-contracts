# Public compatibility surface

This document is the canonical compatibility commitment for the `1.0.0` source candidate. Preparation snapshot (2026-10-15): this candidate was unpublished when prepared. Current release-gate acceptance and registry publication are recorded in [issue #52](https://github.com/suirindo/agent-role-contracts/issues/52), rather than inferred from this versioned document. Downstream adoption is a separate outcome. Its floor is the genuinely published `0.5.0` surface. Machine compatibility changes only installed package/report version metadata; two separately reviewed human CLI-help lines also change wording.

## Migrating from 0.5.0

Upgrading requires no declaration rewrite. Node.js `>=22.5`, all public import paths, synchronous and promise-returning API shapes, CLI commands and exit classes, false limitation claims, the twelve schema files and their existing versions/IDs—including lifecycle schema `0.4` and IDs containing their historical lifecycle versions—and exact G1 digest behavior remain unchanged. Machine reports identify the installed package as `1.0.0`; that top-level `version` field is the sole approved machine-report differential from the archived `0.5.0` corpus. Separately, exactly two reviewed human CLI-help lines change wording.

The 1.x line follows semantic versioning. Compatible additions must preserve existing consumers; deprecations remain available with a documented migration period within the applicable major line, and incompatible contract removal requires a new major version. Candidate testing may install a reviewed local `.tgz`. Any `npm install @netsujo/agent-role-contracts@1.0.0` instruction is conditional on authorized publication and independent registry verification. See [issue #52](https://github.com/suirindo/agent-role-contracts/issues/52) and [RELEASE_GATES.md](RELEASE_GATES.md); acceptance of those gates is recorded for the exact candidate in that issue.

The package is an offline declaration checker. A `valid: true` report means that the declarations passed the checks performed by the invoked operation; it is not a substitute for a different validation operation. In particular, `describeTaskLifecycle` and `lifecycle-describe` can return `valid: true` with `lifecycle_matches_subject: false` when route or phase semantics fail. Use `validateTaskLifecycle` or `lifecycle` for full lifecycle declaration validation. A valid lifecycle may still declare `blocked`, `denied`, `declared_failure` or `missing`; consistency is not work success. It never means that an action was authorized or executed, an identity or evidence was authenticated, a provider was called, a filesystem or chain was inspected, or a deployment or production adoption occurred.

## Extraction boundary

Agent Role Contracts began as a bounded extraction and generalization of declaration-checking ideas from Netsujo's internal AI-agent operations. It is not a byte-compatible or runtime-compatible replacement for Agent OS or the Controller. Public code excludes private organization registries, credentials, host state, customer data and internal execution authority. Role bodies are inline; knowledge references are declarations rather than discovered files or fetched resources.

## Package and API contract

The source package candidate is `@netsujo/agent-role-contracts@1.0.0`, requires Node.js `>=22.5`, and has these unchanged public mappings:

| Import | Target | Exports |
| --- | --- | --- |
| `@netsujo/agent-role-contracts` | `./src/index.mjs` | the complete core and finance sets below |
| `@netsujo/agent-role-contracts/core` | `./src/core.mjs` | `VERSION`, `MAX_INPUT_BYTES`, `validateBundle`, `explainTask`, `validateHandoff`, `describeTaskAction`, `validateTaskActionBinding`, `describeTaskLifecycle`, `validateTaskLifecycle` |
| `@netsujo/agent-role-contracts/profiles/onchain-finance` | `./src/finance-profile.mjs` | `describeFinancialIntent`, `validateFinancialIntent`, `validateFinancialExecution`, `validateSafeProposal` |
| `@netsujo/agent-role-contracts/adapters/filesystem-write` | `./src/filesystem-write-adapter.mjs` | `validateFilesystemWriteMapping` |
| `@netsujo/agent-role-contracts/schemas/*` | `./schemas/*` | the schema files listed below |

Every core and finance export on the root facade is the identical JavaScript value exported by its explicit subpath. The filesystem adapter is intentionally not exported from root or `/core`.

`VERSION` identifies the installed package version (`"1.0.0"` in this candidate); it is deliberately not frozen to the archived package version. `MAX_INPUT_BYTES` is 1,048,576 bytes per input under the current profile. `validateBundle`, `explainTask`, and `validateHandoff` return report objects synchronously. The following existing APIs return promises: `describeTaskAction`, `validateTaskActionBinding`, `describeTaskLifecycle`, `validateTaskLifecycle`, `validateFilesystemWriteMapping`, `describeFinancialIntent`, `validateFinancialIntent`, `validateFinancialExecution`, and `validateSafeProposal`. All accept JSON text, perform declaration checks only, and make no provider calls.

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

Machine reports are deterministic for identical explicit inputs. Every API report includes `tool: "agent-role-contracts"`, `version` equal to the installed package (`"1.0.0"` for this candidate), a stable `kind`, boolean `valid`, sorted `errors` containing `{code,path,message}`. Error `code` and `path` are machine compatibility fields; human message wording is not a byte-stable API. Reports also include these fail-closed fields set to `false`:

`execution_authorized`, `runtime_enforcement`, `identity_verified`, `evidence_verified`, `source_files_checked`, `sensitive_data_scanned`, and `output_schema_validated`.

Profile reports add stable context and limitation fields. In particular, G1 reports use `binding_profile: "task-action/0.3"`; G2 uses `adapter_profile: "filesystem-write/0.1"`; G3 uses `lifecycle_profile: "task-lifecycle/0.4"`; finance uses its existing profile and explicit evaluation fields. Successful adapter, lifecycle, or finance checks continue to report their authentication, byte/state, execution, replay, chain, simulation, serialization, receipt, and transaction-verification limitations as `false` where applicable.

Subject digests are canonical lowercase `sha256:` values over the declarations defined by the relevant profile. G1 hashes the complete object `{profile: 'task-action/0.3', bundle, task, action}`, including the full bundle's roles, policy and routes. Canonicalization recursively sorts object keys using current JavaScript string ordering, retains array order, serializes scalars as currently implemented, encodes UTF-8 and hashes with SHA-256. This custom format is not labelled RFC 8785/JCS. Object member order and harmless JSON whitespace do not change a subject digest. Changing bound task/action/policy/transaction content changes the digest, so a stale binding, mapping, lifecycle, intent, receipt, or Safe proposal fails with the existing typed mismatch diagnostics. Digests bind supplied declarations; they are not signatures, provenance, authenticated evidence, artifact-byte verification, replay protection, or execution authority.

The G1 unit suite includes four reviewed fixed conformance vectors derived independently of the implementation under test and matched against the genuinely published `@netsujo/agent-role-contracts@0.5.0` package (published tarball SHA-256 `5ec610d7158bbccc377337f0272c824ce9c46381a9b0f24edd4126d32100ef13`). They pin the published `starter-bundle` and `starter-task` fixture bytes and cover the baseline action; JavaScript UTF-16 object-key ordering across numeric-looking, BMP and astral keys; UTF-8 hashing; negative zero, fractional-number, maximum-safe-integer, boolean and null serialization; and distinct decomposed and precomposed Unicode strings. The tests also require the same literal digest after harmless whitespace and recursive object-key reordering, while confirming that array order remains significant. This format performs no Unicode normalization.

These source-level vectors establish only the reviewed fixed G1 examples and their documented report limitations. They do not by themselves establish a packed-artifact differential result, supported-platform matrix, final v1 acceptance, publication or production adoption.

## CLI contract

The `agent-role-contracts` binary and its existing commands remain public: `validate`, `explain`, `handoff`, `action-subject`, `action-bind`, `adapter-filesystem-write`, `lifecycle-describe`, `lifecycle`, `finance-subject`, `finance`, `finance-execution`, and `finance-safe`; `help` and `--help` remain available. JSON is the default machine format and `--format text` is the human-readable format. The invoked check exits 0 when its report is valid and 1 when its report is invalid; CLI usage or input-file errors exit 2. The description-versus-validation distinction above also applies to `lifecycle-describe` and `lifecycle`. Validation reports use stdout; CLI/file failures use a separate `CLI_ERROR` JSON object on stderr. Unknown, duplicate, missing or command-inappropriate options are rejected. Exit 0 grants no execution authority.

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

`.github/workflows/core.yml` runs schema checks, the full test suite, release-guard tests and `npm run pack:smoke` in every row. `packed public consumer corpus and optional published differential` additionally packs and installs a fresh candidate into an isolated consumer, checks all public imports and twelve schema byte identities, exercises API/report semantics and all twelve CLI commands, and can compare those observations with the reviewed archived `0.5.0` tarball. It performs no registry lookup. Draft PRs skip hosted CI unless manually dispatched. Local checks are not four-platform acceptance; candidate evidence must bind its exact HEAD and satisfy independent review.

## Phase A evidence map

This map names the evidence actually present; it does not convert a local PASS into full v1 acceptance.

| Item | Reused or new named tests | Phase A status and limit |
| --- | --- | --- |
| V1-01 public compatibility contract | `package subpath mappings and exact export sets remain fixed`; `all twelve public schema paths and their current versions remain fixed`; `generic APIs keep synchronous returns and deterministic positive/negative reports`; `existing declaration APIs keep promise returns and fixed PASS limitations`; `packed public consumer corpus and optional published differential` | Public imports, return behavior, schema versions, CLI commands, report limitations and migration boundaries are documented and covered. Actual four-platform execution is a separate V1-07 gate requiring candidate-bound hosted results. |
| V1-02 packed public consumer | `packed public consumer corpus and optional published differential`; `package subpath mappings and exact export sets remain fixed`; `all twelve public schema paths and their current versions remain fixed` | Candidate pack/install and public consumer behavior are covered. Differential PASS exists only when `ARC_COMPATIBILITY_BASELINE_TARBALL` supplies the exact reviewed archive; default mode reports `NOT_REQUESTED`. |
| V1-03 reports and G1 binding | `reviewed G1 digest vectors pin published starter fixture bytes`; the four `reviewed G1 digest vector: …` subtests; `stale subjects fail deterministically and finance APIs remain async and offline`; `PASS is repeatable integrity binding and does not claim replay protection` | Fixed digests, stale-subject rejection, known report fields and fail-closed limitations are covered. Additive unrelated report fields remain allowed. |
| V1-04 adapter/lifecycle semantics | `exact mapping PASS is consistency only, repeatable without filesystem permission or G1 approval`; `lifecycle description is distinct from full semantic validation`; `a route with several reviewers requires at least one declaration`; `adapter and lifecycle PASS do not supply G1 review/approval; one routed reviewer is sufficient` | Current declared mapping/lifecycle semantics are covered; no filesystem, authentication, runtime or artifact-byte verification is claimed. |
| V1-05 CLI and parser boundary | `packed public consumer corpus and optional published differential`; `CLI refuses nonregular file and malformed UTF8`; `CLI last-component symlink rejected`; `oversized JSON rejected`; `deep nesting bounded`; `untrusted diagnostic control characters are escaped in text output`; `JSON diagnostics escape bidi controls while preserving JSON data`; `schema-valid handoff controls reach exact byte, depth and node limits without authority` | All twelve installed CLI positive and missing-input classes plus bounded malformed options are covered. The named schema-valid handoff control reaches exactly 1,048,576 UTF-8 input bytes, depth 64 and 50,000 inspected nodes with PASS, and rejects one beyond each with INPUT_TOO_LARGE, JSON_INVALID or INPUT_NODE_LIMIT. These resource checks occur before schema validation; the unrestricted inert handoff extensions permit schema-valid positive controls. No runtime authority follows. |

V1-05 also reuses the existing named defensive families: core/accessor and decoded-duplicate-key rejection in tests/core.test.mjs; non-string/accessor, unsafe-integer and duplicate-key cases across tests/action-binding-hardening.test.mjs, tests/filesystem-write-adapter-hardening.test.mjs and tests/task-lifecycle-hardening.test.mjs; portable scope/unsupported action cases in the filesystem adapter suites; Web Crypto absent or failing fails closed; paths, URLs and command-like locators remain inert with global I/O tripwires; and financial input/diagnostic regressions in tests/finance.test.mjs. These are declaration/input checks, not runtime side-effect enforcement.

## 1.x commitment and remaining gates

For 1.x, the surface above is the compatibility floor: existing import paths and identities, sync/async behavior, schema paths and versions, deterministic report structure and typed diagnostics, canonical digest behavior, CLI commands/exit classes, and fail-closed limitations must not be silently weakened or removed. Additive fields or entrypoints must preserve existing consumers; an incompatible change requires a new major-version compatibility decision.

The migration keeps existing declaration/profile versions and public call paths unchanged. The differential compares the archived published 0.5.0 consumer with the candidate's actual packed artifact, requires each report version to equal its own installed metadata, and normalizes only the exact top-level package/report version. It preserves raw CLI bytes and does not recursively strip fields or reserialize JSON. The two previously reviewed help-line substitutions remain explicit; CLI_ERROR stderr is never treated as a report. Existing tags and tarballs are immutable.

Source preparation alone is not v1 acceptance. Each release needs packed-artifact verification, the supported OS/Node matrix, all release/security/provenance gates, documentation review, and independent review and acceptance on the exact candidate commit. Publication and downstream production adoption are separate decisions and evidence.

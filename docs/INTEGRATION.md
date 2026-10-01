# Integrating a declaration check

Agent Role Contracts validates the JSON declarations supplied to it. A PASS is a preflight result; it grants no permission to run an agent, write files, merge a change or publish a release. Runtime adapters and authorization are outside version `0.1.0`.

## Bind the check to the proposed work

Use the JSON-text API (`validateBundle`, `explainTask`, `validateHandoff`) or the CLI on explicit inputs. Supply the approved bundle and policy from a trusted source; arbitrary task or user-supplied authority declarations must not become the integration’s authorization policy. Bind the result to the bundle digest and task revision, and verify identity and approval freshness immediately before execution. Keep the exact bundle, task and any handoff input with the result, and identify the checker version used. A result from different inputs is not evidence for the current task. The checker does not manage this record or verify its integrity.

If the CLI exits 1 (inconsistent declarations) or 2 (argument/input-file failure), stop the dependent execution. Missing, malformed or unverifiable results should also stop that execution. When an adapter uses the API, it must inspect the reported result and handle errors; merely receiving a return value is insufficient. Do not widen authority automatically to turn a failure into a PASS.

## Responsibilities retained by the integration

| Boundary | What the checker can establish | What the integration must establish |
| --- | --- | --- |
| Identity | Role IDs and references agree within the supplied bundle. | Authenticate the person or runtime acting as each role and bind it to the approved task. A role name is not proof of identity. |
| Review | The declared implementer and reviewer satisfy the declaration rules. | Confirm the actual review came from the required independent reviewer/runtime and covers the exact candidate. Distinct role IDs alone do not prove independence. |
| Evidence | Supplied handoff fields satisfy supported consistency checks. | Verify test/review evidence, its origin and its relationship to the exact source/artifact. Evidence command strings are data; the checker never executes them. |
| Human approval | A route can declare that human approval is required; an explain result reports that requirement. | Obtain approval from an authorized person, with scope and subject recorded. A declared requirement or a PASS is not an approval receipt. |
| Freshness | Checks use the supplied declarations. | Confirm current policy, ownership, approval and source identity before the consequential action. Recheck when relevant inputs or authority change; a saved PASS has no built-in expiry or revocation mechanism. |
| Write scope | Portable relative task scopes are contained by declared executor scopes. | Enforce actual filesystem/service permissions and current writer ownership. Textual containment does not resolve paths, expand globs, lock files or prevent another writer. |
| Output | Supported handoff structure is consistent. | Verify the produced source/artifact and required quality gates. `output_schema` remains metadata; the package does not validate the output against it. |

Every report explicitly leaves `execution_authorized`, `runtime_enforcement`, `identity_verified`, `evidence_verified`, `source_files_checked`, `sensitive_data_scanned` and `output_schema_validated` false. Keep these limits visible in logs and user-facing decisions. An adapter must not relabel them as guarantees supplied by this package.

## Input-file and process limits

The core accepts JSON text and does not open application files. The CLI reads explicitly supplied regular files. Stable final-component symlinks are rejected on supported CI platforms; POSIX uses `O_NOFOLLOW`, while Windows additionally checks with `lstat` before opening. This is not a filesystem sandbox. The Windows precheck does not claim protection against a hostile path replacement between check and open.

Treat role `body`, knowledge references and evidence strings as input data. The core does not fetch knowledge URIs, discover role files, execute commands or authenticate their sources. A downstream integration that consumes those strings must supply its own trust and access controls. The checker is not a secret, malware or prompt-safety scanner, or a security boundary against compromise of the entire JavaScript process.

Start with the [Quick Start](QUICKSTART.md), then read the [compatibility boundary](COMPATIBILITY.md), [schema profile](SCHEMA_PROFILE.md) and [release acceptance boundary](RELEASE_GATES.md). Follow [SECURITY.md](../SECURITY.md) for a security report and omit credentials and customer data from public issues.

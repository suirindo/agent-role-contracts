# Integrating a declaration check

Agent Role Contracts validates supplied declarations. A PASS is a preflight consistency result; it grants no permission to run an agent, write files, call an external tool, merge a change, move funds or publish a release.

The public npm release is currently `0.1.0`. The repository also contains newer unreleased source, including the G1 task/action subject-binding APIs. Keep the checker version and exact inputs with every integration record; do not treat repository-only APIs as available in the public `0.1.0` package.

## Bind the check to the proposed work

Supply the approved bundle and policy from a trusted source. User- or task-supplied authority declarations must not silently become the integration's authorization policy.

For the v0.1 bundle/task/handoff APIs, retain the exact input bytes, checker version and your own trusted task/source revision with the result. A saved PASS has no built-in expiry or revocation mechanism.

For the unreleased G1 source APIs, `describeTaskAction` returns a `subject_digest` over the complete validated bundle, task and declared action. `validateTaskActionBinding` can check that routed review and required accountable-approval declarations refer to that same subject. The digest provides integrity binding only: it is not a signature, identity proof, timestamp, approval receipt, runtime authorization or replay token. A changed subject must invalidate the old binding rather than causing the integration to synthesize a new approval.

If the CLI exits 1 or 2, or an API report is invalid, missing or unverifiable, stop the dependent action. Do not widen authority automatically to turn a failure into PASS.

## Responsibilities retained by the integration

| Boundary | What the checker can establish | What the integration must establish |
| --- | --- | --- |
| Trusted policy | Supplied roles, policy, routes and task declarations are internally consistent under the supported profile. | Choose and authenticate the canonical policy/bundle source. Untrusted input must not redefine authorization. |
| Identity | Role IDs and references agree within the supplied declarations. | Authenticate the person or runtime acting as each role and bind that identity to the current task. |
| Review | Routed review declarations are structurally consistent; G1 can bind them to the current subject. | Confirm the actual review came from the required independent reviewer/runtime and covered the exact candidate. Distinct role IDs alone do not prove independence. |
| Human approval | A route can require approval; G1 can bind an approval declaration to the current subject. | Obtain approval from an authorized person and verify its identity, scope and freshness. A declaration is not an authenticated approval receipt. |
| Evidence and artifacts | Handoff/evidence references can be checked for supported declaration consistency. | Verify evidence origin and exact artifact/source bytes. A path, URL or command string is data, not verified evidence. |
| Freshness and replay | Subject changes invalidate stale G1 bindings. | Recheck current policy, ownership, source identity and external state immediately before consequential action; maintain task/run identity and replay policy. |
| Write/resource scope | Portable relative task scopes can be compared with declared executor scopes. | Enforce real filesystem, service, API, wallet or resource permissions. G1 action parameters do not define external-tool semantics. |
| Output quality | Supported declaration structure can be checked. | Verify produced outputs and quality gates. `output_schema` remains metadata and is not executed as an arbitrary schema. |

Every report keeps execution/runtime/identity/evidence claims fail-closed. Do not relabel those false fields as guarantees supplied by this package.

## Input-file and process limits

The core accepts JSON text and performs no application I/O. The CLI reads explicitly supplied regular files. Stable final-component symlinks are rejected on supported CI platforms; POSIX uses `O_NOFOLLOW`, while Windows additionally checks with `lstat` before opening. This is not a filesystem sandbox and is not a security boundary against compromise of the whole JavaScript process.

Treat role body text, knowledge references, action parameters and evidence strings as data. The core does not fetch knowledge URIs, execute evidence commands, invoke external actions or authenticate their sources. A downstream adapter must define and enforce its own supported tool/resource semantics.

Start with the [Quick Start](QUICKSTART.md), then read the [architecture](ARCHITECTURE.md), [compatibility boundary](COMPATIBILITY.md), [schema profile](SCHEMA_PROFILE.md) and [release gates](RELEASE_GATES.md). Follow [SECURITY.md](../SECURITY.md) for a security report and omit credentials and customer data from public issues.

# Literal path declarations (source-only experiment)

This explicitly imported experiment addresses the recorded SITE #699 route-group
path limitation. It reuses the canonical declaration rules and G1/G2 implementations
through internal factories. Stable root/core/adapter APIs, authored public schemas,
schema objects, package version and exports retain their existing contracts.
The private implementation files have been factored; their source bytes change.

No package release, permission, file write, test execution, reviewer authentication,
semantic completion, or human value result is established by this profile.

## Explicit versions

Import `./profile.mjs` from this directory. There is no implicit loading,
public package subpath, CLI auto-detection or conversion API.

| Input or subject | Version/profile |
| --- | --- |
| Bundle schema_version | literal-path-bundle/0.1 |
| Task schema_version | literal-path-task/0.1 |
| G1 subject profile | task-action-literal-path/0.1 |
| G2 mapping schema_version | literal-path-mapping/0.1 |
| G2 report adapter_profile | filesystem-write-literal-path/0.1 |
| Review envelope schema_version | literal-path-envelope/0.1 |
| Review report_kind | review-evidence-literal-path/0.1 |

The existing action and binding JSON shapes remain `0.3`; the G1 canonical subject
has a distinct profile and includes the complete versioned bundle and task.
An old profile's review/approval digest cannot validate the new subject, including
for ordinary paths. Unknown and mixed bundle/task versions fail closed.
Callers must explicitly construct and review new declarations; no upgrade,
approval synthesis or automatic reinterpretation occurs.

Canonical schemas are cloned privately and derived by changing only bundle/task
version discriminators and the G2 mapping's version/path pattern. Existing role
data shapes remain canonical; there is no duplicated authored role schema.
Derived schema identifiers use distinct experimental URNs.

Lifecycle and handoff APIs for these new versions are not provided. Do not pass
a new version to old APIs expecting compatibility; the old APIs reject it.

## Literal grammar

Each segment is an ordinary `[A-Za-z0-9][A-Za-z0-9._-]*` identifier, or that
identifier enclosed in one complete pair of parentheses, such as `(ja)`.
Paths are relative, case-sensitive slash-separated byte-exact declarations.
A scope may end in `/**`; a concrete G2 file path cannot.

Parentheses have literal meaning. No framework route interpretation, regex/glob
expansion, percent decoding, Unicode normalization, backslash conversion or path
normalization occurs. Traversal, absolute/drive/UNC paths, empty segments,
nested/unbalanced/empty parentheses, embedded wildcards and control characters
are rejected. G2 additionally retains reserved-device and trailing-dot restrictions.
Dot directories, `[slug]` and interception routes remain unsupported.

Scope containment alone is not filesystem portability or permission.
A declaration does not resolve symlinks or prove global runtime mediation.

## Review evidence

`evaluate` accepts the existing review-evidence input fields with the explicit
new envelope version. It uses the same bounded, read-only Git collector and
separate declaration/artifact/test/semantic/authority/execution dimensions.
It neither runs candidate code nor authenticates supplied test receipts.

Use a faithful exact changed-file envelope and the real required test plan.
Keep absent test evidence, actual authority and semantic acceptance unknown.
A maintainer replay over historical committed work is not voluntary user adoption
or a human time-savings measurement.

Run `node --test tests/literal-paths.test.mjs` from the repository root.
Full checks, release/pack compatibility, independent exact-subject QC and required
four-platform CI remain integration gates.

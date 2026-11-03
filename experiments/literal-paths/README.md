# Literal path declarations (source-only experiment)

This explicitly imported experiment addresses the recorded SITE #699 route-group
path limitation. It reuses the canonical declaration rules and G1/G2 implementations
through internal factories. Stable root/core/adapter APIs, authored public schemas,
schema objects, package version and exports retain their existing contracts.
The private implementation files have been factored; their source bytes change.

No package release, permission, file write, test execution, reviewer authentication,
semantic completion, or human value result is established by this profile.

## Choose a profile

- Stable (`src/core.mjs`, the CLI in `bin/`): every segment starts with an ASCII
  letter or digit, except a root `.github`; leading `_x`, `[slug]` and `(group)`
  segments are unsupported. Internal underscores remain supported.
- `literal-path/0.1`: the sections "Explicit versions (0.1)" through
  "Review evidence" below.
- `literal-path/0.2`: the section "literal-path/0.2". Use it for `[slug]`,
  `.hidden` or `_private` paths. The 0.1 limits on those shapes do not apply to it.

The versions are never selected implicitly; the 0.2 CLI requires `--profile`.

## Explicit versions (0.1)

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

## Literal grammar (0.1)

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

## literal-path/0.2 (source-only)

`profile-0.2.mjs` and `cli.mjs` are a separate profile. `literal-path/0.1`, the
stable core and the published package are unchanged. Nothing here is a package
export, and `npm pack` contains no `experiments/` file.

| Artifact | Version |
| --- | --- |
| bundle | `literal-path-bundle/0.2` |
| task | `literal-path-task/0.2` |
| G1 binding | `task-action-literal-path/0.2` (new digest domain) |
| G2 mapping | `literal-path-mapping/0.2` |
| G2 adapter | `filesystem-write-literal-path/0.2` |
| envelope | `literal-path-envelope/0.2` |
| report | `review-evidence-literal-path/0.2` |

Mixed or foreign versions fail closed. A stable or 0.1 binding digest never
validates under 0.2 (`G1_SUBJECT_MISMATCH`), and the reverse.

### First run

Needs Node.js >= 22.5 and a source checkout of this repository; run every command
from its root. Installing `@netsujo/agent-role-contracts` does not provide this CLI or
profile, and nothing here needs or authorizes `npm install`, `npm publish` or any
other npm command. Work in a scratch directory outside the checkout:

```
mkdir ../lp02-try
cp examples/team.json ../lp02-try/bundle.json
cp examples/code-task.json ../lp02-try/task.json
```

1. In `bundle.json`, set the top-level `schema_version` to
   `literal-path-bundle/0.2`. In the `implementer` role, replace
   `contract.authority.allowed_write_scopes` with the real path or the narrowest
   subtree, for example `["src/app/[locale]/(marketing)/_components/**"]`.
   A `/**` scope also covers hidden descendants such as `.env`; see
   [Containment](#containment).
2. In `task.json`, set `schema_version` to `literal-path-task/0.2` and
   `inputs.scope` to the same path or a path inside it.
3. Run:

```
node experiments/literal-paths/cli.mjs explain --profile literal-path/0.2 \
  --bundle ../lp02-try/bundle.json --task ../lp02-try/task.json --format text
```

| Exit | Code | Next step |
| --- | --- | --- |
| 0 | none | Text output starts `PASS` and names `literal-path/0.2`; JSON has `valid: true` and `scope_profile`. This grants no permission. |
| 1 | `WRITE_SCOPE_SYNTAX`, `TASK_WRITE_SCOPE_INVALID` | The scope is outside the grammar. Record `UNSUPPORTED_REQUIRED_SCOPE`; do not rename or widen it. |
| 1 | `RUNTIME_SPECIFIC_DECLARATION` | A separate, unchanged rule for `.claude`/`.codex` scopes; 0.2 cannot fix it. |
| 1 | `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` | Fix the declared role authority or the task scope. |
| 2 | `CLI_ERROR` | Fix the invocation or file (missing option, unreadable or oversized file, symlink, invalid UTF-8). |

### Grammar

A scope is `/`-separated segments, optionally ending in `/**`. Every byte is
literal; nothing is normalized. `[a-z]` is a directory literally named `[a-z]`,
not a character class (`src/[a-z]/**` does not contain `src/b/x`); do not feed
these scopes to glob-based tools. A segment is one of:

- `name`, `.name`, `_name` (ASCII letters, digits, `_`, `-`, interior `.`);
  must not end in `.`;
- `(group)`;
- `[slug]`, `[...slug]`, `[[...slug]]` with `slug` = `[A-Za-z0-9_][A-Za-z0-9_-]*`.

Rejected: traversal, absolute/drive/UNC paths, control characters, embedded
wildcards, trailing dots, spaces, Unicode, `@slot`, interception shapes
`(.)x` `(..)x` `(...)x`, and any segment equal (case-insensitively, at any depth)
to `.git`, `.claude` or `.codex`. `.github`, `.gitignore`, `.gitkeep` and
`.gitattributes` remain accepted. A `.claude` role scope also still raises the
unchanged `RUNTIME_SPECIFIC_DECLARATION`.

Unlike 0.1, `src/file.` is rejected. G2 additionally rejects Windows device
names in concrete file paths; that limit does not apply to scopes.

### Containment

Containment is byte-exact, case-sensitive prefix containment, and the same
function serves grants and `protected`. **`src/**` includes hidden, underscore
and bracket descendants** (`src/.env`, `src/_x`, `src/[slug]/x`), which 0.1 and
the stable core did not. Review existing `/**` grants before adopting 0.2.
Protected `src/**` therefore also covers hidden descendants.

A changed path that is not expressible in 0.2 (for example one containing a
space) is reported `PATH_OUT_OF_SCOPE`; if a required scope cannot be written,
report `UNSUPPORTED_REQUIRED_SCOPE` and do not widen the grant.

### Diagnostics

Error codes and paths equal the stable ones. Only the message gains the 1-based
segment index and a reason class: `malformed`, `reserved-git`, `runtime-reserved`
or `unsupported-shape`.

### CLI

```
node experiments/literal-paths/cli.mjs validate --profile literal-path/0.2 --bundle B.json [--format json|text]
node experiments/literal-paths/cli.mjs explain  --profile literal-path/0.2 --bundle B.json --task T.json [--format json|text]
```

`--profile` is mandatory and never inferred. Exit 0 pass (grants no permission),
1 invalid declaration, 2 CLI/file error. The file reader matches the stable bin
(no symlinks, regular files only, 1 MiB cap, strict UTF-8 with one leading BOM
removed, escaped output).

### Limits

No symlink resolution, no case-insensitive-filesystem collision detection
(`Src` and `src` are distinct bytes), no proof of runtime mediation, no
execution. Run `node --test tests/literal-paths-0.2.test.mjs tests/literal-paths-cli.test.mjs`.

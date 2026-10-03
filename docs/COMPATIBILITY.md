# Compatibility and extraction boundary

Agent Role Contracts v0.1.0 is a bounded extraction and generalization of declaration-checking ideas used in Netsujo's internal AI-agent development operations. It is not a byte-compatible or runtime-compatible replacement for Netsujo's internal Agent OS or Orchestrator.

## Reused and adapted concepts

The public package retains selected declaration concepts: strict JSON parsing, role identity and mission fields, explicit authority, required and conditional inputs, reviewer separation, explicit routing, task-scope containment, knowledge references, and handoff relationships.

Public code removes company registries, production policy state, runtime credentials, host state, customer data, and internal execution authority. Consumers provide the declarations and policy boundaries to validate.

## Deliberately public-specific behavior

The package provides standalone bundle, task, role, and handoff schemas; JSON-text APIs; a CLI; deterministic diagnostics; bounded input parsing; fictional examples; and a prewritten starter workflow.

Role body text is inline. The package does not discover internal role files, HOME configuration, or repository profiles. Knowledge references are declarations only and are not fetched.

The schema engine implements only the documented bounded profile used by the bundled schemas. It is not a general JSON Schema implementation.

## Excluded from v0.1.0

v0.1.0 does not include:

- actual runtime permission enforcement;
- provider execution or credentials;
- company or customer organization registries;
- private knowledge/policy bodies;
- scheduling, recovery orchestration or deployment;
- source-file/evidence authentication;
- secret scanning;
- managed control-plane state.

## Public compatibility guarantee

A successful validation means only that the supplied declarations are internally consistent under the v0.1.0 profile.

It does not authenticate identity, verify evidence, grant filesystem or repository permissions, authorize merge/deploy, or prove that a runtime can enforce the declared controls.

v0.1.0 is the first public compatibility baseline. Future incompatible public contract changes require an explicit schema/package version change.

## Additive core/profile source split (unreleased)

The current architecture candidate preserves the existing root exports, synchronous generic APIs, asynchronous finance APIs, schemas and diagnostics. It adds `/core` and `/profiles/onchain-finance` import subpaths. The core entrypoint and generic CLI commands do not load the optional finance modules or schemas. The root remains a compatibility facade and still imports finance; optional entrypoints do not mean separate npm packages. See [the design](ARCHITECTURE.md) for implemented versus planned boundaries.

## Required candidate compatibility matrix

| Runner | Node.js | Purpose |
| --- | --- | --- |
| `ubuntu-latest` | `22.5.0` | Minimum supported version |
| `ubuntu-latest` | `24` | Newer Node line |
| `macos-latest` | `22` | macOS compatibility |
| `windows-latest` | `22` | Windows compatibility |

`.github/workflows/core.yml` runs schema checks, the full test suite, release-guard tests and `npm run pack:smoke` in every row. The packed consumer checks root/core/adapter/finance imports, all 11 schema exports (6 core + 1 adapter + 4 finance/Safe), the CLI and all six demos without lifecycle scripts or registry dependencies. `tests/compatibility-matrix.test.mjs` guards the required rows and commands.

Draft pull requests skip hosted CI unless the workflow is manually dispatched. Local checks do not establish four-platform acceptance: all four jobs must pass on the candidate's exact HEAD, followed by independent review. This matrix describes required coverage, not a claim that a particular candidate has passed.

## G2 development candidate (0.4.0-alpha.1, unreleased)

The root and `/core` also expose async `describeTaskAction` and `validateTaskActionBinding`. 11 schemas ship as three disjoint groups: 6 core, 1 adapter and 4 unchanged finance/Safe. The explicit `/adapters/filesystem-write` subpath validates only mapping declaration consistency; it is absent from root and `/core` exports. Generic CLI commands load neither adapter nor finance, and each optional command loads only its own module. Mapping PASS does not supply G1 review/approval PASS or permission. New action/binding schemas use version `0.3` and binding profile `task-action/0.3`. Binding PASS means declaration subject consistency only; it authenticates no identity, review, approval, evidence or permission and provides no execution or replay enforcement. Action IDs do not establish external task/run replay identity.

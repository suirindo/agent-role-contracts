# Compatibility and extraction boundary

G0, G1, G2 and G3 are merged and implemented in repository main. G2 PR #17 merged as `2b20851bdd9b7fd6823f5bd606f3d2f6345459ff`; G3 PR #19 merged as `d18f867d91ec8abb4038af85f17c7b3d4954b869`. Repository source remains the unreleased development preview `0.5.0-alpha.1`. G2 filesystem-write remains an optional explicit `/adapters/filesystem-write` subpath and is not re-exported from root or `/core`. G3 provides generic core lifecycle declarations, not a runtime, state machine or authenticator. Source merge and implementation do not imply npm publication, production adoption, runtime permission, deployment, authenticated evidence or execution authority.

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

The merged repository source preserves the existing root exports, synchronous generic APIs, asynchronous finance APIs, schemas and diagnostics. It adds `/core` and `/profiles/onchain-finance` import subpaths. The core entrypoint and generic CLI commands do not load the optional finance modules or schemas. The root remains a compatibility facade and still imports finance; optional entrypoints do not mean separate npm packages. See [the design](ARCHITECTURE.md) for implemented versus planned boundaries.

## Required candidate compatibility matrix

| Runner | Node.js | Purpose |
| --- | --- | --- |
| `ubuntu-latest` | `22.5.0` | Minimum supported version |
| `ubuntu-latest` | `24` | Newer Node line |
| `macos-latest` | `22` | macOS compatibility |
| `windows-latest` | `22` | Windows compatibility |

`.github/workflows/core.yml` runs schema checks, the full test suite, release-guard tests and `npm run pack:smoke` in every row. The packed consumer checks root/core/adapter/finance imports, all 12 schema exports (7 core + 1 adapter + 4 finance/Safe), the CLI and all seven demos without lifecycle scripts or registry dependencies. `tests/compatibility-matrix.test.mjs` guards the required rows and commands.

Draft pull requests skip hosted CI unless the workflow is manually dispatched. Local checks do not establish four-platform acceptance: all four jobs must pass on the candidate's exact HEAD, followed by independent review. This matrix describes required coverage, not a claim that a particular candidate has passed.

## G1/G2 APIs in the unreleased repository source

The root and `/core` also expose async `describeTaskAction` and `validateTaskActionBinding`. 12 schemas ship as three disjoint groups: 7 core, 1 adapter and 4 unchanged finance/Safe. The explicit `/adapters/filesystem-write` subpath validates only mapping declaration consistency; it is absent from root and `/core` exports. Generic CLI commands load neither adapter nor finance, and each optional command loads only its own module. Mapping PASS does not supply G1 review/approval PASS or permission. New action/binding schemas use version `0.3` and binding profile `task-action/0.3`. Binding PASS means declaration subject consistency only; it authenticates no identity, review, approval, evidence or permission and provides no execution or replay enforcement. Action IDs do not establish external task/run replay identity.

## G3 lifecycle declarations (0.5.0-alpha.1, unreleased)

Root and `/core` export async `describeTaskLifecycle` and `validateTaskLifecycle`. Seven core schemas, one adapter schema and four unchanged finance/Safe schemas form the twelve-schema aggregate. Lifecycle schema `0.4` / profile `task-lifecycle/0.4` binds the current G1 subject. Describe checks structure and subject/artifact identity; validate additionally checks routed actors, phase decisions and required review/approval declarations. `lifecycle_matches_subject` always reflects full validation; artifact identity consistency is independent. Negative decisions remain valid declarations. Run IDs are correlation only; locators are inert and artifact bytes are never read. No runtime, authenticity, replay or state-machine enforcement is provided. G3 is merged and implemented in repository main; publication and adoption remain separate. No npm publication is claimed.

# Runtime conformance comparison spike

Source-only, unexported experiment responding to the “clean-pass drift” problem:
a declaration can pass static checks while supplied operation records contradict it.
This is Phase 1 of an investigation, not runtime verification or enforcement.

Run from a source checkout (Node.js >=22.5):

```sh
node experiments/runtime-conformance/demo.mjs
node --test tests/runtime-conformance-spike.test.mjs
```

The demo checks software changes, CSV report output, and support drafts. For each:
supplied matching observations → scope violation with static checks still passing →
unknown after evidence loss. All events, principals, digests and timestamps are fictional.
No agent starts, target file is written, credentials are used, or observation is collected.

## Boundary and report

`compareRuntimeObservations(bundleJson, taskJson, actionJson, manifestJson, batchJson, contextJson)`
accepts six strict JSON strings. See `fixtures.mjs` for the closed experimental format.
The API reuses existing bundle/task/G1 checks, portable scope containment and G2 mapping.
One source/epoch, one run, one G1 action, a maximum of 256 events, and 1 MiB per JSON
input are supported. Supported events are filesystem write, task-routed review handoff,
and review referencing an earlier write. Review handoff is not delegated execution.
No approval authentication, permission inventory discovery, arbitrary tool semantics,
review-omission rule, stream processing, cross-source ordering or run-to-run replay
protection is implemented.

- `static_checks` names the declaration checks actually performed; it is not G1 approval.
- `supplied_conformance`: `matching`, `violation`, `unknown`, or `not_evaluated`.
- `observed_conformance` is always `unknown`: no event or identity is authenticated.
- `freshness`: `fresh`, `stale`, `invalidated`, or `unknown`, evaluated against explicit time.
- `coverage` is a **declared** complete/incomplete sequence window, not measured coverage.
- `provenance=unverified`, `operational_acceptance=false`; all existing false limitation
  claims remain false. No user-supplied trusted/verified flag is accepted.

`valid=true` means only that the finite supplied batch matches these checks. It does not
mean that all required events occurred, that the run completed successfully, or that
the runtime conformed. Even a matching complete=true batch remains unauthenticated.
Review-principal equality detects a contradiction in supplied identities; different
principal strings do not prove independence. Handoff constraints are explicit manifest
edges intersected with the task route, not interpretations of role-body prose.

Unknown operations, ambiguity, stale identities, gaps, impossible/future timestamps
and conflicting events cannot become a matching result. Duplicate identical events
are idempotent. Violations remain visible alongside gaps. Foreign batch/run/config
bindings stop semantic interpretation as current evidence.

The comparator has no I/O or implicit clock. ISO UTC milliseconds are required;
Date.parse is used only on explicit inputs. Resource paths and locators are inert.
Event digests are declarations, not measured artifact bytes. No result authorizes work.

## Compatibility and next acceptance

This directory is outside the package's published `files` inventory. No public exports,
schemas, G1 digest format, existing CLI, package version, or release workflow changes.
Run `npm run check` and `npm run pack:smoke` for existing compatibility coverage.

Before any public API or runtime claim: independently review the exact candidate,
evaluate one real read-only collector integration, establish provenance and observation
coverage outside self-reported JSON, and measure incremental value/cost against existing
controls. See [workflow evaluation issue #47](https://github.com/suirindo/agent-role-contracts/issues/47).
Merge and publication follow existing repository gates; this spike does not advance a release.

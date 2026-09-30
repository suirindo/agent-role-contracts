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

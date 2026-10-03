# Contributing

Agent Role Contracts is general-purpose and intentionally small. Contributions should preserve the v0.1 boundary: declaration validation without becoming an agent runtime or authorization system.

Keep the core independent of application-specific rules. Read [the architecture and evolution design](docs/ARCHITECTURE.md). A reusable core change needs a cross-domain rationale, negative tests, and compatibility coverage; a domain-only change belongs in an explicit optional profile. Do not introduce a new runtime, implicit plugin loader or duplicate role/task schema.

The optional v0.2 finance profile extends declaration validation to bounded onchain-finance proposals. Preserve the v0.1 APIs and schemas. Financial changes need exact base-unit, subject-binding, ambiguous-policy and negative approval/simulation regressions. Examples must use fictional assets, actors and evidence, with no signing or broadcasting. Per-proposal limits must not be described as aggregate budgets or runtime enforcement.

Before opening a pull request:

1. describe the contract inconsistency, diagnostic or interoperability problem being addressed;
2. add a focused regression, including a failing case for authority/review changes;
3. run `npm run check`;
4. keep diagnostics deterministic and fail closed on ambiguous declarations;
5. avoid provider credentials, customer data, internal paths and runtime-specific authority in fixtures.

Breaking public schema or API changes require an explicit package/schema version change. Security reports should follow `SECURITY.md`.

# General-purpose architecture and evolution

Design revision: 2026-10-03. This source proposal restores the general-purpose product direction. Its implementation status is stated separately from future design below. Source acceptance, merge and registry publication are distinct milestones.

## 1. Product purpose

Agent Role Contracts is a small, offline, general-purpose checker for AI-agent **role, authority, task scope, review separation and handoff declarations**. It makes contradictions visible before another system acts. Software development, data processing, content preparation, support drafting and business workflows share these coordination problems. Onchain finance is one optional application profile, not the product's identity or mandatory roadmap.

The core answers: Who is assigned? What may that role declare it can do? What inputs and scope does this task require? Who independently reviews it? To whom may the result be handed off? It does not answer whether a person is authenticated, whether a model is competent, whether evidence is true or whether a host has actually enforced permissions.

Generality means reusing these concepts across tasks, **not** turning the package into an agent runtime, orchestration platform, arbitrary plugin loader or universal policy language. A new domain should normally need different contract data and examples, not a fork of the core.

## 2. Responsibility boundaries

| Layer | Owns | Does not own |
| --- | --- | --- |
| Generic core | Strict JSON input, roles, capability declarations, routes, required inputs, portable write-scope containment, reviewer separation, handoff consistency, deterministic diagnostics | Industry rules, providers, credentials, filesystem enforcement, execution or live state |
| Optional application profiles | Additional explicit domain rules after core consistency; their own schemas and diagnostics | Relaxing core restrictions or silently authorizing execution |
| Integration adapters (future work) | Bind a declared task/action to a concrete external tool or runtime, expose supported/unsupported semantics | Changing role authority, inventing approval, treating an unverified PASS as permission |
| Consumer runtime | Trusted policy supply, real identity, time, permissions, actual execution, independent review, approvals and evidence collection | Claiming that the declaration checker alone performed these responsibilities |

Dependency direction is profiles/adapters to the generic core or its shared validation primitives. The generic core must not import optional domain schemas, wallet formats or provider clients. No layer gains authority because another layer returned PASS.

## 3. Reusable concepts and current limits

The existing v0.1 role, bundle, task and handoff schemas remain canonical. Roles separate capabilities from assigned work; routes separate executors from reviewers; tasks identify inputs, objective and acceptance criteria; handoffs identify the task, origin, next role, declared status, evidence references and unresolved work.

The current scope validator is specifically a portable relative file/directory declaration, optionally ending in `/**`. General-purpose task examples do not prove support for arbitrary database rows, SaaS objects, email recipients or API authorization. Such resource semantics require an explicit, versioned extension and adapter contract later. Required inputs currently apply across routed participants; staged creation of later inputs is not implemented.

A declared read-only reviewer is not proof of real runtime independence. An evidence reference is not evidence authentication. A handoff status of complete is not a verified execution receipt. These limits remain explicit even when an example passes.

## 4. Source architecture in this proposal

| Entry or module | Role |
| --- | --- |
| `@netsujo/agent-role-contracts/core` / `src/core.mjs` | Domain-neutral public entry: `validateBundle`, `explainTask`, `validateHandoff`, version and input limit |
| `src/validation.mjs` | Shared internal JSON/bundle/task validation; no optional profile imports |
| `src/schemas.core.generated.mjs` | Only the four existing generic schemas |
| `@netsujo/agent-role-contracts/profiles/onchain-finance` / `src/finance-profile.mjs` | Explicit optional import of existing financial proposal/evidence/receipt checks |
| `src/schemas.finance.generated.mjs` | Only the three existing finance schemas |
| `src/index.mjs` | Backward-compatible facade retaining every existing public export |
| `src/schemas.generated.mjs` | Compatibility aggregate of the two generated schema sets |
| `bin/agent-role-contracts.mjs` | Generic commands load the core; finance commands load their profile explicitly |

Schema JSON files remain the only authored schema source. The existing generator builds and verifies every generated module. No alternate role/task schema and no new dependency are introduced.

**Optional imports are not separate npm packages.** This proposal still ships one package. The compatibility root necessarily imports the existing finance facade; consumers requiring a domain-isolated dependency graph should use `/core`. A future package split or root-export removal would require an explicit compatibility decision, not a silent refactor.

Existing synchronous generic APIs, asynchronous finance APIs, schema versions, diagnostic ordering and CLI command/exit semantics are preserved. New subpaths are additive. Package version selection belongs to the eventual release cut; this proposal does not publish or reuse an unaccepted version as a released artifact.

## 5. Concrete non-financial acceptance examples

`npm run demo:general --silent` reuses the existing team/task/handoff fixtures and exactly the same core schemas for three tasks:

| Task | Declared output scope | Intentionally not demonstrated |
| --- | --- | --- |
| Software change | One file under `src/**` | Code execution, test truth or deployment |
| Data cleaning | A report under `reports/**` | Reading a real dataset, modifying its source or verifying output correctness |
| Support drafting | A reply draft under `drafts/**` | Sending messages, customer-system access or recipient authorization |

Each checks the assigned task, rejects out-of-scope work, rejects self-review, rejects missing input, rejects a different-task handoff and accepts a correctly routed review handoff. That is 18 expected outcomes, not 18 real business tasks executed. Passing these fixtures is an engineering compatibility result, not independent-user adoption evidence.

## 6. Ordered evolution, not a finance-led feature queue

| Phase | Work | Acceptance boundary | Status in this proposal |
| --- | --- | --- | --- |
| G0: core isolation | Separate entrypoints and schemas, preserve compatibility, generic-first documentation, non-financial examples | Core/CLI/quickstart work with finance files absent; existing behavior remains covered | Implemented candidate; review/merge/release separate |
| G1: generic task/action binding | Reuse the idea of complete-subject binding for any task, independent of assets or wallets | Changes to role policy, route, inputs, objective, acceptance or declared action invalidate old bindings; at least three non-financial examples | Design only; no new binding API shipped here |
| G2: external adapter contract | Versioned mapping from a generic task/action to supported external tool semantics | Changed target/action/resource is rejected; unknown operations stay unsupported; core denials cannot be overridden | Design only; select a concrete integration before adding fields |
| G3: evidence and lifecycle interoperability | Represent declared review/approval/execution/evidence subjects without pretending they are authenticated | Missing or stale evidence cannot be called verified; outputs separate declaration consistency, artifact integrity and runtime acceptance | Design only; no controller or execution-state engine shipped here |
| Optional profiles | Domain-specific rules, including onchain finance and later evidenced use cases | Extra restrictions compose with the core; unrelated users do not load the profile | Existing finance retained; Safe draft deferred |

Every new feature must explain a cross-domain coordination problem, identify reusable concepts, include negative tests and distinguish core behavior from adapter/runtime responsibilities. Do not invent several industry-specific schemas simply to appear general. Do not let one integration determine the whole roadmap.

## 7. Planned binding design constraints

G1 should identify a complete canonical subject: explicit contract/profile version, policy, roles and routes, task revision/inputs/objective/acceptance, and the declared action. Referenced output artifacts need their own exact-byte digest supplied or computed by a trusted adapter; a path or URL alone is not an immutable artifact identity. This is a design constraint, not a new schema in G0.

All consumers must distinguish consistency, integrity and authenticity. A content digest detects different declared bytes; it is not a signature, authorization, timestamp, actual execution proof or proof that a retrieved source is true. Repeated subjects also require an external task/run identity and replay policy where relevant. A changed subject must invalidate prior review/approval declarations; the core must not synthesize fresh approval automatically.

Time and external state remain explicit inputs. Do not silently read a clock, fetch referenced URLs, execute evidence commands or load executable configuration inside the core. Unknown adapter/profile versions cannot silently become a generic PASS. Profile-specific PASS must never imply a broader set of checks than actually performed.

## 8. Treatment of the existing Safe draft

Safe proposal work remains a recoverable optional integration candidate in PR #12, not the next mandatory core milestone. It is not merged by this proposal and is not copied into `/core`. Its broad serialization flag needs review: checking selected `to/value/data/operation` fields must not be described as authenticating the full signed Safe transaction, gas/refund fields, wallet payload, owners, signatures or execution. Any future acceptance must enumerate the precise fields/bytes checked and retain false or unverified for all other claims.

The prior finance implementations are retained, not discarded. Their reusable lessons about subject changes and evidence freshness inform G1, while asset amounts, spender limits and chain-specific formats remain in optional profiles. Financial profiles do not authorize real fund movement.

## 9. Delivery and validation

Keep exact source identity, deterministic regression evidence, package inspection, independent review and the existing platform/release gates. Required checks are not waived by architecture changes. Preserve PR #2's separate onboarding work; reconcile it during adoption rather than silently replacing that contribution.

For G0, acceptance includes all existing tests, public-export identity, disjoint generated schema sets, optional-profile compatibility, real execution of the core-only CLI/quickstart copy, and the three non-financial examples. The isolation test omits financial modules from a temporary test copy; it never deletes source files from the repository.

General-purpose adoption should later be measured by independent teams successfully using their own contracts, the variety of non-financial tasks, useful diagnostics, successful integrations and maintenance cost. No usage, safety, speed or revenue outcome is inferred from synthetic fixtures or a merged PR.

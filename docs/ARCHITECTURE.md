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
| Integration adapters (G2 candidate) | Bind a declared task/action to a concrete external tool or runtime, expose supported/unsupported semantics | Changing role authority, inventing approval, treating an unverified PASS as permission |
| Consumer runtime | Trusted policy supply, real identity, time, permissions, actual execution, independent review, approvals and evidence collection | Claiming that the declaration checker alone performed these responsibilities |

Dependency direction is profiles/adapters to the generic core or its shared validation primitives. The generic core must not import optional domain schemas, wallet formats or provider clients. No layer gains authority because another layer returned PASS.

## 3. Reusable concepts and current limits

The existing v0.1 role, bundle, task and handoff schemas remain canonical. Roles separate capabilities from assigned work; routes separate executors from reviewers; tasks identify inputs, objective and acceptance criteria; handoffs identify the task, origin, next role, declared status, evidence references and unresolved work.

The current scope validator is specifically a portable relative file/directory declaration, optionally ending in `/**`. General-purpose task examples do not prove support for arbitrary database rows, SaaS objects, email recipients or API authorization. Such resource semantics require an explicit, versioned extension and adapter contract later. Required inputs currently apply across routed participants; staged creation of later inputs is not implemented.

A declared read-only reviewer is not proof of real runtime independence. An evidence reference is not evidence authentication. A handoff status of complete is not a verified execution receipt. These limits remain explicit even when an example passes.

## 4. Source architecture in this proposal

| Entry or module | Role |
| --- | --- |
| `@netsujo/agent-role-contracts/core` / `src/core.mjs` | Domain-neutral public entry: `validateBundle`, `explainTask`, `validateHandoff`, version and input limit; integrated G1 adds async `describeTaskAction` and `validateTaskActionBinding` |
| `src/validation.mjs` | Shared internal JSON/bundle/task validation; no optional profile imports |
| `src/schemas.core.generated.mjs` | Existing generic schemas; integrated G1 adds task-action and task-action-binding |
| `@netsujo/agent-role-contracts/profiles/onchain-finance` / `src/finance-profile.mjs` | Explicit optional import of existing financial proposal/evidence/receipt checks |
| `src/schemas.finance.generated.mjs` | The four existing finance/Safe schemas |
| `@netsujo/agent-role-contracts/adapters/filesystem-write` / `src/filesystem-write-adapter.mjs` | G2 candidate: explicit `write_file` declaration mapping, separate from G1 review/approval binding |
| `src/schemas.adapters.generated.mjs` | G2 candidate: disjoint filesystem-write mapping schema set |
| `src/index.mjs` | Backward-compatible core+finance facade; adapter is explicit subpath only |
| `src/schemas.generated.mjs` | Aggregate of 11 schemas: 6 core, 1 adapter and 4 finance/Safe |
| `bin/agent-role-contracts.mjs` | Generic commands load only core; adapter and finance commands lazily load their respective modules |

Schema JSON files remain the only authored schema source. The existing generator builds and verifies every generated module. G1 adds action/binding declarations without replacing the existing role/task schemas or introducing an industry-specific core schema.

**Optional imports are not separate npm packages.** This proposal still ships one package. The compatibility root necessarily imports the existing finance facade; consumers requiring a domain-isolated dependency graph should use `/core`. A future package split or root-export removal would require an explicit compatibility decision, not a silent refactor.

Existing synchronous generic APIs, asynchronous finance APIs, schema versions, diagnostic ordering and CLI command/exit semantics are preserved. New subpaths are additive. The unreleased development candidate is `0.4.0-alpha.1`; this source version does not imply registry publication.

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
| G0: core isolation | Separate entrypoints and schemas, preserve compatibility, generic-first documentation, non-financial examples | Core/CLI/quickstart work with finance files absent; existing behavior remains covered | Merged and implemented; publication separate |
| G1: generic task/action binding | Reuse the idea of complete-subject binding for any task, independent of assets or wallets | Changes to role policy, route, inputs, objective, acceptance or declared action invalidate old bindings; at least three non-financial examples | Merged and implemented; publication and adoption separate |
| G2: external adapter contract | Versioned mapping from a generic task/action to supported external tool semantics | Changed target/action/resource is rejected; unknown operations stay unsupported; core denials cannot be overridden | Filesystem-write implemented candidate; independent review pending, not released/adopted |
| G3: evidence and lifecycle interoperability | Represent declared review/approval/execution/evidence subjects without pretending they are authenticated | Missing or stale evidence cannot be called verified; outputs separate declaration consistency, artifact integrity and runtime acceptance | Design only; no controller or execution-state engine shipped here |
| Optional profiles | Domain-specific rules, including onchain finance and later evidenced use cases | Extra restrictions compose with the core; unrelated users do not load the profile | Finance and Safe merged as optional profile |

Every new feature must explain a cross-domain coordination problem, identify reusable concepts, include negative tests and distinguish core behavior from adapter/runtime responsibilities. Do not invent several industry-specific schemas simply to appear general. Do not let one integration determine the whole roadmap.

## 7. G1 binding and G2 integration boundary

G1 identifies the complete canonical subject `canonical({profile: 'task-action/0.3', bundle, task, action})`: the full bundle including policy, role contracts/bodies, knowledge and routes, the full task including inputs/objective/acceptance, and the full declared action. Changes to these declarations invalidate prior bindings. Action and binding JSON use schema version `0.3`. Flat scalar action parameters are declarations only; the G2 candidate gives only the explicit filesystem-write mapping below; external permissions remain the runtime’s responsibility.

The executable `examples/action-binding/demo.mjs` reuses the cross-domain builders and generic team/task/handoff fixtures. Software change and data cleaning mutate action parameters; support drafting mutates a task input. Each obtains the digest with async `describeTaskAction(bundleJson, taskJson, actionJson)`, declares routed passing review and required approval from `route.accountable`, validates PASS with async `validateTaskActionBinding(bundleJson, taskJson, actionJson, bindingJson)`, and requires `G1_SUBJECT_MISMATCH` for the unchanged binding after mutation. It executes no action and authenticates no reviewer or approver.

Run `npm run demo:binding` on the integrated candidate for six expected binding outcomes. G0 and G1 are merged and implemented; merge is not release, publication or adoption evidence.

Referenced output artifacts need their own exact-byte digest supplied or computed by a trusted adapter; a path or URL alone is not immutable evidence or an immutable artifact identity. G1 binds the reference declaration, not the retrieved artifact bytes.

All consumers must distinguish consistency, integrity and authenticity. A content digest can distinguish declared content identities; this checker does not inspect bytes. It is not a signature, authorization, timestamp, actual execution proof or proof that a retrieved source is true. Repeated subjects also require an external task/run identity and replay policy where relevant. A changed subject must invalidate prior review/approval declarations; the core must not synthesize fresh approval automatically.

Time and external state remain explicit inputs. Do not silently read a clock, fetch referenced URLs, execute evidence commands or load executable configuration inside the core. Unknown adapter/profile versions cannot silently become a generic PASS. Profile-specific PASS must never imply a broader set of checks than actually performed.

### First concrete adapter: filesystem-write

G2 filesystem-write is an implemented candidate awaiting independent review, not released or adopted. Existing portable relative file/subtree scope semantics already span software, data and support tasks, so this adapter needs no industry schema. G3 remains design-only.

The optional integration entrypoint `@netsujo/agent-role-contracts/adapters/filesystem-write` exports async `validateFilesystemWriteMapping(bundleJson, taskJson, actionJson, mappingJson)` from `src/filesystem-write-adapter.mjs`. Adapter profile `filesystem-write/0.1` uses mapping schema version `0.1`. A G1 schema-version `0.3` action must have kind `filesystem-write` and exactly two parameters, `path` and `content_sha256`. Its mapping declares the current G1 `subject_digest`, operation `write_file`, and exactly matching path and digest. Unknown operations, parameters and semantics are refused rather than inferred. Core denials cannot be overridden; the path must fit the task scope and eligible routed executor declarations. No arbitrary SaaS, database, API or other resource semantics are supported.

`content_sha256` is a caller-supplied declared integrity identity, not a measurement by this checker. No target bytes are read or verified; filesystem state and path existence are not checked. A mapping PASS grants no permission, executes nothing and implies no review approval. Executor identity is not authenticated and permissions are not enforced. G1 review/approval binding is separate and must refer to the complete current subject; the adapter neither validates nor synthesizes that binding.

`examples/filesystem-write-adapter/demo.mjs` reuses the generic builder and fixtures for `src/example.mjs`, `reports/cleaned.csv` and `drafts/reply.md`. It obtains each subject with `describeTaskAction`, accepts the matching mapping, then requires a specific failure after a mapping path or digest mutation. Fictional digests keep the example offline without opening or writing target files. Run `npm run demo:filesystem-adapter` or `node examples/filesystem-write-adapter/demo.mjs`. The candidate includes the package subpath; this is not a published-release claim.

## 8. Merged optional Safe profile

Safe proposal support from PR #12 is merged in the optional finance profile and remains outside `/core`. `safe_call_envelope_matches_intent` covers the declared subject, chain, Safe address, nonce and supported CALL envelope fields. Canonical transaction serialization and transaction hashes remain unverified; the checker authenticates no Safe account, owners, signatures or execution.

The prior finance implementations are retained, not discarded. Their reusable lessons about subject changes and evidence freshness inform G1, while asset amounts, spender limits and chain-specific formats remain in optional profiles. Financial profiles do not authorize real fund movement.

## 9. Delivery and validation

Keep exact source identity, deterministic regression evidence, package inspection, independent review and the existing platform/release gates. Required checks are not waived by architecture changes. Preserve PR #2's separate onboarding work; reconcile it during adoption rather than silently replacing that contribution.

For G0, acceptance includes all existing tests, public-export identity, disjoint generated schema sets, optional-profile compatibility, real execution of the core-only CLI/quickstart copy, and the three non-financial examples. The isolation test omits financial modules from a temporary test copy; it never deletes source files from the repository.

General-purpose adoption should later be measured by independent teams successfully using their own contracts, the variety of non-financial tasks, useful diagnostics, successful integrations and maintenance cost. No usage, safety, speed or revenue outcome is inferred from synthetic fixtures or a merged PR.

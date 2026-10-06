# CrewAI adapter spike

This source-only spike checks one bounded CrewAI task pair against an existing Agent Role Contracts bundle.

It deliberately **does not generate authority from CrewAI role text**. The ARC bundle remains the authority source of truth. The adapter only maps explicit framework configuration:

- the implementation task's `agent`
- the implementation task's `output_file`
- the review task's `agent`
- the review task's explicit `context`
- the mapped ARC `task_type`

The current CrewAI project format is JSON-first (`crew.jsonc` plus `agents/*.jsonc`). Classic YAML projects can later feed the same normalized structure, but YAML parsing is intentionally outside this spike. The fixtures use the strict JSON subset of JSONC, so ARC adds no JSONC/YAML parser dependency.

## Proof

Run:

```sh
node examples/crewai-adapter-spike/demo.mjs
```

Expected path:

```text
PASS
FAIL (expected): TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY
PASS
```

The failure is produced by changing only CrewAI's explicit `output_file` from `docs/example.md` to `secrets/production.txt`. The existing ARC bundle allows the routed implementer to write only inside its declared scopes, so the unchanged ARC policy rejects the changed framework config.

## Fail-closed boundary

This spike rejects rather than infers when:

- implementation and review use the same agent;
- the review task does not explicitly depend on the implementation task;
- the review task declares its own `output_file`;
- agent or task tools are non-empty, because tool semantics are not mapped;
- `allow_delegation=true`, because delegation targets are not explicitly mapped;
- directory creation is requested;
- the CrewAI executor or reviewer differs from the ARC route;
- the bounded project contains additional unmapped tasks or agents.

A PASS means only that the supplied declarations agree. It does not start CrewAI, authenticate agents, enforce runtime permissions, invoke tools, create directories, or write the output file.

This file describes repository source only. It is not a claim that the `0.5.0` npm release exposes a CrewAI adapter subpath.

# ARC × ShipRules-free comparison

This fixture compares two different checks against one public, pinned baseline:

- ARC v1.0.0 checks whether a declared task path stays inside the implementer role's declared write authority.
- ShipRules-free's public Godot 4 scanner checks `.gd` files for listed Godot 3 syntax.

The comparison is intentionally narrow. It does not exercise or infer the paid ShipRules hooks or CI files, and neither check grants runtime authority or proves who performed an edit.

## Pinned inputs

- ARC v1.0.0: `9f6771056c47de971202360952af6d41941f7625`
- ShipRules-free: `8b8302e9551fb8784d7cbe7fa61eeecf127bf247`
- ShipRules scanner SHA-256: `58b650402c321d69cdeddc3b71abcb55ad882585a9bdad00929b1f545c61b8d7`

## Cases

| Case | ARC declaration result | ShipRules scanner result | Meaning |
| --- | --- | --- | --- |
| Clean baseline | PASS | PASS | Both accept their own tested dimension. |
| Out-of-scope task using scanner-clean content | FAIL with `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` | PASS | ARC catches declared authority drift; the syntax scanner has no reason to reject. |
| In-scope Godot 3 syntax | PASS | FAIL | The task stays in declared scope; the scanner catches its syntax concern. |
| Repaired in-scope Godot 4 syntax | PASS | PASS | Both accept after the syntax repair. |

## Run

Requires Git, Bash and Node.js 22.5+. Use clean, separate checkouts:

```sh
git clone https://github.com/suirindo/agent-role-contracts.git arc-kit
git clone --branch v1.0.0 --depth 1 https://github.com/suirindo/agent-role-contracts.git arc-v1
git clone https://github.com/otctrading101/shiprules-free.git shiprules-free
git -C shiprules-free checkout 8b8302e9551fb8784d7cbe7fa61eeecf127bf247

node arc-kit/experiments/external-evaluation/shiprules-free/run-comparison.mjs \
  --arc-v1 arc-v1 \
  --shiprules shiprules-free
```

The runner refuses a wrong commit, tracked modifications in either pinned checkout, or a changed scanner hash. It prints one JSON report and exits `0` only when all four expected outcomes match.

The first maintainer run is recorded in [`results/maintainer-linux-20261026.json`](results/maintainer-linux-20261026.json). Its observed command exited `0`; all four expected outcomes matched. Machine wall time is recorded separately from unmeasured human setup time.

## Evidence boundary

This is a maintainer-executed, public-repository synthetic comparison until an independent ShipRules maintainer or another external operator reviews or runs it. A successful run adds zero completed external hands-on evaluations. Human setup time, independent keep/remove judgment and actual agent execution remain unverified.

Tracking: [ARC issue #75](https://github.com/suirindo/agent-role-contracts/issues/75).

# T4 F1 candidate inputs (ARC #117), byte-exact

**Declaration evidence only. `NOT_FROZEN / LAB_NOT_AUTHORIZED / ERP_NOT_RUN`.**

[Test Contract V0.3.4](https://github.com/boris-ai-sec/ai-security-lab/blob/1c2d59060b97da8a2ea29bc4bf9faaf8035a064c/labs/aimm-p2-executable-evidence/TEST_CONTRACT_V0.3.4.md) Annex D lists the ARC-side candidate identities for C0–C3. The [original ARC probe](https://github.com/suirindo/agent-role-contracts/issues/117#issuecomment-6701526956) ran them from a temporary directory that was deleted on exit, so the bytes existed only as text in a comment. This directory keeps them as files, so a partner or reviewer can hash and replay them without retyping JSON.

| File | Case | SHA-256 of the raw file |
| --- | --- | --- |
| `inputs/bundle.json` | C0–C3 (same bytes as `examples/team.json` at `873b410`) | `648ad076f29d7768383059e2b740e7db8d8cf15ba925e9204d7712d9a21177e1` |
| `inputs/task.json` | C0–C3 | `0d3994f5315c10abf89ac0e707d8a34d6ab40a90e5cbd1e40f343ecf87477b2c` |
| `inputs/action.json` | C0, C2, C3 (quantity 40) | `733b7814b6d924da783ac79ef2195280c95939fdf455722955bc0dc1279cb370` |
| `inputs/binding.json` | C0–C3 prior binding, fictional and unauthenticated | `2a262ddf4f081db76dcec44478a2d3836cdb6e927c29b82595a56816bdbd075a` |
| `inputs/action.c1.json` | C1 only: `parameters.quantity` 40 → 41 | `013cf0aaca515d15ea78e71e099e936c28cc57e4aa5c2e30270fd6feb030f33c` |

Full hashes and the expected results are in [manifest.json](manifest.json). `tests/t4-f1-inputs.test.mjs` checks, on every CI run:

- each raw file hash equals the manifest and Annex D;
- `action-subject` gives G1 subject `sha256:57279a3e6404743fbe77ed00b86cfc276e269eab30a21921f1b965fc8bcd1d79` for C0/C2/C3 and `sha256:85c802e52c85e70ce54ff9d93cdb3755f2c4c5918772336cd871a0a898e6ec75` for C1;
- `action-bind` with the prior binding exits `0` for C0/C2/C3 and exits `1` with `G1_SUBJECT_MISMATCH` for C1;
- every result has `execution_authorized: false`;
- a whitespace-only re-serialisation of `action.json` keeps the same G1 subject but changes the raw file hash. That is why the contract pins **both** the raw file hash and the G1 subject: they are different identities.

## Reproduce

```sh
npm test -- tests/t4-f1-inputs.test.mjs
sha256sum experiments/external-evaluation/t4-f1-inputs/inputs/*
```

## Not covered here

This does not freeze the inputs or show partner acceptance. The ARC-to-ERP correlation receipt, its issuer and keys, the Run Controller and the stage records are still open joint F1 decisions (V0.3.4 §7, §10). No Guardian, Gateway, MCP server, ERP or PostgreSQL was run. A G1 PASS never authorises ERP forwarding.

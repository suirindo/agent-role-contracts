# SQLite fixture for write-time checks and result readback

[日本語](README.ja.md)

This offline fixture uses a temporary SQLite database and synthetic data. It compares a write-time target and revision check with result readback after a simulated lost response. It uses Python's standard library and calls no ARC modules.

## Run

From the repository root:

```sh
python3 experiments/cross-tool-effects/sqlite-readback/reproduce.py
```

On Windows, use `py -3` in place of `python3`. A successful run exits 0 and prints six rows followed by `6/6 matched; network=0; resend=0`. A mismatch exits 1 and writes all actual rows to stderr as `unexpected results: …`. The script creates no output files in the checkout. [results.tsv](results.tsv) is a sample of the complete successful output.

## Cases

| Case ID | Changed condition | Application status |
| --- | --- | --- |
| `allowed` | Allowed target and revision | `APPLIED` |
| `declaration_only` | Protected target substituted, check disabled | `APPLIED` |
| `changed_target` | Same substitution, check enabled | `AUTHORITY_MISMATCH` |
| `stale_revision` | Allowed target with stale revision | `AUTHORITY_MISMATCH` |
| `response_lost` | Response lost after commit, readback available | `READBACK_CONFIRMED` |
| `reader_unavailable` | Response lost after commit, readback skipped | `HOLD_UNKNOWN` |

## Read the output

Each case row has five tab-separated fields. The first two are the case ID and application status. The last three are the draft value, protected value and persisted operation count. A test oracle reads all three through a separate read-only connection in every case. The final summary line is separate from the six rows.

## Compare the controls

Compare `declaration_only` with `changed_target`. The same substitution changes the protected value when the check is off. With the check on, the value stays `before` and the persisted operation count is zero.

Compare `response_lost` with `reader_unavailable`. The test oracle observes one committed operation in both cases. The application confirms the operation when it can read it back and stays in `HOLD_UNKNOWN` when that readback is skipped.

## Limits

The application and oracle share the read function and process, and the application checks only the operation ID and target. The unavailable-reader case uses a flag to skip application readback. Network and resend are absent by construction. The summary values `network=0` and `resend=0` are constants. The status codes and revision comparison are local to the fixture. The six cases do not exercise duplicate-operation branches, real services, credential separation, OS isolation or crash recovery.

## Relation to ARC

The fixture is outside the npm package and the ARC check and CI suites. It changes no ARC core, schemas, API or package version. The [separate loopback lab](../lab/README.md) covers response loss, HTTP 404 and replay behavior with a separate receiver process.

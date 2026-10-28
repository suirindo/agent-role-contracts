# Native denial observations (ARC #85)

This source-only experiment separates a native tool result from an independently
observed file effect. It adds no runtime permission, executor, credential,
release, native policy change or authenticated evidence service.

## Actual 2026-10-28 cloud trial

The trial used fictional files in a new disposable directory outside the
session's declared ordinary writable roots. A separate Linux inotify process
watched both sentinels, their directories and the fixture root before either
restricted request. Explicitly authorized setup and before/after controls used
the privileged setup surface; the two restricted requests used their ordinary
tool interfaces. No existing checkout or user data was a test target.

| Actual route | Native result | Independent observation |
| --- | --- | --- |
| `apply_patch` direct file edit | Empty success result; a native permission-decision receipt was not exposed | Six sentinel events; content hash changed |
| `exec_command`, `sandbox_permissions: use_default` | Python was dispatched, then file open failed with `EROFS` / read-only filesystem | Zero sentinel events during its window; content, file identity and recorded metadata unchanged |

Each route had six observed sentinel events in its before control and six in
its after control. These are duplicate file/directory notifications, not six
separate writes. The observer remained healthy and terminated on request.

**Strict native acceptance is UNKNOWN for both rows.** The toolserver build,
authenticated session identity and effective per-route loaded configuration
were not exposed. The first observer version also captured parent identity but
not parent mode/timestamps. The common supplied permission declaration is not
proof that both tool implementations loaded identical effective permissions.
Do not turn the direct-file effect into a denial PASS, or infer whole-harness
confinement or a product vulnerability from this bounded trial.

The decision is **REVISE**: retain the actual route-specific observations and
obtain those missing identities and parent metadata before a strict repeat.
There is no reason to repeat the already observed writes against additional
files or hosts merely to increase a count.

### Evidence and reproduction

`evidence/20261028-cloud/` contains:

- `tool-observations.json`: exact harmless requests and captured tool returns.
- `observer.jsonl`: ordered events, barriers, heartbeats and before/after hashes.
- `summary.json`: window references, observed outcomes, limitations and decision.
- `classification-inputs.json`: actual missing identities preserved as null;
  both incomplete inputs remain `UNKNOWN` in the classifier.
- `observe.py`: the exact original observer source used for this trial.

The summary records the as-run observer source SHA-256 and the original and
published log hashes. Auxiliary fixture-directory entry names are redacted to
stable aliases in the published log; event order, masks, timestamps and all
sentinel events are retained. Nanosecond integers are normalized to decimal
strings with Python before JavaScript parsing, retaining their exact precision.
The original log remains unchanged. No key, credential or user-file content is stored.

The as-run Linux-only source is preserved byte-for-byte at
`evidence/20261028-cloud/observe.py`. The current `observe.py` additionally records
parent mode, modification time and change time for future observations. It does
not fill in the missing historical fields or change either actual result from
`UNKNOWN`. Neither version writes the fixture. To exercise the revised observer
with a newly authorized synthetic fixture:

```sh
python3 experiments/native-denial/observe.py \
  --fixture /absolute/path/to/disposable-fixture \
  --commands /absolute/path/to/commands.jsonl \
  --output /absolute/path/to/new-observer.jsonl --seconds 600
```

The fixture must already contain `direct/sentinel.txt` and `exec/sentinel.txt`.
The output must not exist. After `READY`, append newline-delimited commands
such as `{"phase":"direct:start"}` and wait for the corresponding logged
barrier. Perform each authorized control and requested test through the real
native interfaces, then record the end barrier before the after control.
`{"phase":"complete","stop":true}` requests a drained terminal record.
Missing terminal, overflow, lost watches or failed controls invalidate a
negative conclusion. Do not grant new permissions to make a restricted request
work. A same-UID observer is not tamper-proof.

## Offline classifier

```js
import { evaluate } from './experiments/native-denial/evaluate.mjs';
const result = evaluate(JSON.stringify(observation));
```

The complete synthetic input shape is in `tests/native-denial.test.mjs`.
The classifier only evaluates supplied JSON observations. It does not
authenticate them. Native decision, dispatch, observer health, exact subject,
route, timing, file and parent metadata, and bracketing controls are separate
requirements. Transient write-then-restore events contradict a denial even when
the final hash matches. Unsupported and untested routes remain distinct.

`BOUNDED_DENIAL` means the supplied complete evidence is internally consistent
for that bounded interval. It never grants execution authority or establishes
whole-machine safety. Missing actual-trial fields must stay null/absent; do not
invent an identity to satisfy the synthetic input contract.

Run the deterministic author checks with:

```sh
node --test tests/native-denial.test.mjs
```

The collector has separate Python standard-library regressions:

```sh
python3 tests/native-observer.test.py
```

They check real parent-only `chmod`/`utime` changes with an unchanged sentinel
and, on Linux, parent metadata in ready/barrier/terminal records from the actual
inotify process. These are observer regressions, not another native permission
trial. The Python tests are standalone; `npm run check` does not run them. The
non-Linux run explicitly skips the inotify lifecycle case. Raw nanosecond values
must still be normalized to decimal strings in Python before JavaScript parsing.

## Native-only / ARC comparison

The native-only trial above is actual execution. The ARC classifier checks
offline evidence, including deliberately fabricated denial-plus-mutation
fixtures. It has not been installed as a native admission gate and no second
ARC-assisted native trial was performed. Both approaches receive the same
available permission declaration and event observations; either can identify
the route difference. Incremental native enforcement value is **not
established**, overlap is a valid result, and adoption/real-work counts are not
incremented. A second native trial and exact effective inventories remain open
under #85; #69 separately owns native approval provenance and operation binding.

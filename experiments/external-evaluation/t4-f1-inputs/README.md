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
node --test tests/t4-f1-inputs.test.mjs
sha256sum experiments/external-evaluation/t4-f1-inputs/inputs/*
```

## Not covered here

This does not freeze the inputs or show partner acceptance. The ARC-to-ERP correlation receipt, its issuer and keys, the Run Controller and the stage records are still open joint F1 decisions (V0.3.4 §7, §10). No Guardian, Gateway, MCP server, ERP or PostgreSQL was run. A G1 PASS never authorises ERP forwarding.

## Offline G1 runner candidate (ARC-owned)

**`NOT_FROZEN / LAB_NOT_AUTHORIZED / ERP_NOT_RUN`.** ARC-owned candidate producing unsigned ARC components for the partner's T4 v0.3 companion. The owner supplied the [November 20 companion ZIP](https://github.com/boris-ai-sec/ai-security-lab/pull/11#issuecomment-7032466244): its 134284 bytes, SHA-256 `e0c0ef52d39cb8a252c6ca33b18dd4c972ab1bc91d2fc5616eb735be0c5b445f` and all 19 inner file hashes matched. The formats below come from those actual bytes. This is not a complete C5 package, a joint acceptance or an authorized lab run.

```text
node experiments/external-evaluation/t4-f1-inputs/run-g1.mjs --case <C0|C1|C2|C3> --tarball <npm .tgz> --out <new directory>
```

It runs the published `@netsujo/agent-role-contracts@1.0.1` CLI `action-bind` over the fixed `inputs/` (C1 uses `action.c1.json`). No signing and no ERP forwarding. The runner makes no network requests, and network isolation is not enforced. The tarball is read in memory and unpacked to a temporary directory that is removed on exit.

### Run C0 and C1 (from the repository root)

Prerequisites: Node `v24.22.1` (the pinned `node_version`), and the package tarball already acquired. Acquiring the tarball is a separate, earlier step that needs the network and is not part of the offline runner. Run it in a directory outside the checkout:

```text
npm pack --ignore-scripts @netsujo/agent-role-contracts@1.0.1
```

Set `ARC_T4_F1_TARBALL` to the absolute path of the resulting `.tgz`, then run the block below from the repository root. The flags are `--case`, `--tarball`, `--out`, each once and in this order. `--out` must be a new directory, so the block creates its own temporary directory outside the checkout and uses a new subdirectory per case.

```sh
ARC_T4_F1_WORK="$(mktemp -d "${TMPDIR:-/tmp}/arc-t4-f1.XXXXXX")"
node --version
node experiments/external-evaluation/t4-f1-inputs/run-g1.mjs --case C0 --tarball "$ARC_T4_F1_TARBALL" --out "$ARC_T4_F1_WORK/c0"
echo "C0 wrapper exit: $?"
node experiments/external-evaluation/t4-f1-inputs/run-g1.mjs --case C1 --tarball "$ARC_T4_F1_TARBALL" --out "$ARC_T4_F1_WORK/c1"
echo "C1 wrapper exit: $?"
```

Expected wrapper exit codes: C0 exits `0` and C1 exits `1`. C2 and C3 use the same command with `--case` changed, and the expected exit code is `0`. Exit `1` for C1 is the expected rejection (`G1_SUBJECT_MISMATCH`), not a failure. The evidence is in `g1-run-evidence.json` under each output directory.

### Exit codes (two layers, recorded separately)

| Wrapper exit | Meaning | `runner_status` | `g1_verdict` |
| --- | --- | --- | --- |
| `0` | CLI exit `0`, `valid:true`, `execution_authorized:false` | `OK` | `PASS` |
| `1` | CLI exit `1`, `valid:false` with `G1_SUBJECT_MISMATCH` | `OK` | `G1_SUBJECT_MISMATCH` |
| `2` | CLI exit `2` (CLI/file error, no declaration result) | `RUNNER_ERROR` | `NOT_OBSERVED` |
| `3` | Refusal before the CLI ran, or runner error: timeout, signal, spawn error, non-JSON output, exit that contradicts `valid` or `execution_authorized` | `REFUSED` or `RUNNER_ERROR` | `NOT_OBSERVED` |

For a consistent G1 result, the wrapper passes through CLI exit `0` or `1`. An observed G1 rejection therefore exits `1`. Anything outside `{0,1}` means `REFUSED` or `RUNNER_ERROR`, as the table specifies. `exit.json` holds `cli` and `wrapper` separately (`exit_code`, `argv_resolved`, `reason`). Raw `stdout.bin`, `stderr.bin` and the exit codes are kept even when the output is inconsistent. A refusal writes `exit.json` and `g1-run-evidence.json` only (`cli.spawned:false`). If `--out` already exists, nothing is written and the reason goes to stderr.

The runner does **not** grade the result against the case expectation. `case_expectation` (from `manifest.json`) and `observed` are recorded side by side. `matches_manifest_expectation` is informational and never changes the exit code. A well-formed unexpected outcome is an observation, not a runner error. The comparison belongs to the verifier.

The CLI reads private snapshots of the exact input bytes that were hash-verified. It uses the same relative paths in all four cases, including `inputs/action.json`; for C1 this execution snapshot contains the verified `action.c1.json` bytes. `cli.input_files` records the original names. The runner retains all five original inputs from the same verified buffers, so a later change to the originals cannot alter the consumed or retained bytes. The runner also treats CLI output as a runner error unless `subject_digest` is `sha256:` plus 64 hex characters, `binding_matches_subject` is a boolean, every `errors` entry is an object with a non-empty string `code`, and the result is internally consistent (PASS: exit 0, `valid:true`, binding true, no errors; `G1_SUBJECT_MISMATCH`: exit 1, `valid:false`, binding false). A well-formed unexpected digest or outcome is still only an observation.

### Evidence

`g1-run-evidence.json` is evidence, not a receipt. `g1_verdict` has scope `declaration_consistency_only`. `prior_binding` is `{synthetic:true, authenticated:false}`. The limitation flags are copied from the parsed raw `stdout.bin`, with the SHA-256 of those bytes. `sequence` records `pins_checked`, `inputs_hashed`, `cli_spawned`, `cli_exited` with monotonic counters; the wall-clock time is informational. The unsigned output, `execution_authorized:false` and a `not_claimed` list are always present (no ERP effect or no-effect claim, no complete C5 package, no joint acceptance).

### Partner components and the exact command

Use the generated **`partner-runner-pins.json`** with the partner verifier's `--runner-pins` option. It has exactly four top-level fields: `wrapper_sha256`, `package_integrity`, `node_version`, `command`. The committed `runner-pins.json` is internal wrapper configuration and is not accepted by that option.

The exported `command` is the exact inner executable plus argv actually passed to `spawnSync`, also recorded in `cli.argv_resolved`. Its first item is the absolute `process.execPath` observed on the execution host. The remaining items are:

```json
["package/bin/agent-role-contracts.mjs", "action-bind", "--bundle", "inputs/bundle.json", "--task", "inputs/task.json", "--action", "inputs/action.json", "--binding", "inputs/binding.json", "--format", "json"]
```

These relative paths are resolved within the private verified snapshot, which is removed after execution. On the same Node installation, C0–C3 therefore produce identical command pins, including C1. A different Node executable path produces a different pin. No host-specific path is hard-coded in this repository, and no placeholder template is passed off as an executed command.

| Output under the new directory | Meaning |
| --- | --- |
| `arc/g1.stdout`, `arc/g1.stderr` | Exact CLI output bytes at the companion's check 4 paths; also retained under the legacy `stdout.bin` and `stderr.bin` names |
| `arc/g1.exit` | Actual integer CLI exit in decimal plus one LF; absent when no integer exit was observed, such as a POSIX signal termination |
| `arc/inputs/{bundle,task,action,binding,action.c1}.json` | All five verified original input files, retaining both original action and C1 variant |
| `partner-runner-pins.json` | Four flat pins from the actual preparation execution |
| `arc-runner.json` | Component for `#/$defs/arc_runner`: the four pins plus the published package source commit `873b4104a95e443ba22367cf8378deb7dcbe6cfd`, package name and version `1.0.1`. The source commit is not this wrapper's PR HEAD |
| `arc-inputs.json` | Component for `#/$defs/t4-run-open-1/properties/arc_inputs`. Its `action_sha256` always identifies the original quantity-40 action, including in C1 |
| `arc-c1-variant.json` | Component for `#/$defs/t4-run-open-1/properties/c1_variant`: C1 variant hash and observed subject, or `null` for other cases |
| `arc-artifacts.json` | `ARC_PARTIAL_ONLY` list of the eight raw-output/input paths with SHA-256 and `size_bytes`. It is not the complete partner evidence index |

The five JSON components are emitted only for `runner_status: OK`, which means a consistent G1 observation, not that the case met its expectation. `REFUSED` and CLI `RUNNER_ERROR` do not emit those components. If writing the evidence fails, the wrapper exits `3` and removes the component files it created; raw evidence is retained. Treat the entire output as incomplete and unusable if writing or rollback fails, even if some files remain. Raw output and verified input bytes are retained when the CLI was spawned; failures remain visible in `exit.json` and `g1-run-evidence.json`.

The generated pins remain **`ARC_OWNER_PROPOSED / NOT_IN_RC / NOT_JOINTLY_ACCEPTED`**. A preparation execution supplies the actual environment-specific values; those values must be independently accepted and frozen before an authorized joint run. The component objects contain only schema-permitted keys; their proposal status and limits are recorded in `g1-run-evidence.json`, `arc-artifacts.json` and this README. ARC does not create or sign the Controller's run-open, run-receipt, Gateway handoff or full evidence index.

### Companion version and remaining joint decisions

The November 20 ZIP still contains the older R02 proposal with LC4 and eight checks, and the earlier R03 proposal. The [November 23 decision](https://github.com/boris-ai-sec/ai-security-lab/pull/11#issuecomment-7093453087) and [Boris's confirmation](https://github.com/boris-ai-sec/ai-security-lab/pull/11#issuecomment-7099967587) exclude LC4, require all seven checks to be evaluated and recorded, and strengthen the R03 pre-forward accounting direction. Those changes are not implemented by this ARC F1 adapter. The ZIP is not a fully updated, jointly frozen specification.

The companion reference verifier does not implement checks 4 and 10, so component/schema checks or its cross-case check 15b cannot establish full C5 `VALID_PASS`. Joint F1 acceptance still needs the exact runner pins, C1 ordering, signed Controller records, Gateway handoff and their implementation version. Freeze and run authorization remain separate decisions. Partner files are not vendored here; this change supplies ARC-owned code, inputs and connection evidence.

### Pins (`runner-pins.json`)

Status: `ARC_OWNER_PROPOSED / NOT_IN_RC / NOT_JOINTLY_ACCEPTED`. This is ARC's internal configuration layout. The generated `partner-runner-pins.json` above supplies the partner's flat format and actual inner command.

| Pin | Value |
| --- | --- |
| `wrapper_sha256` | SHA-256 of `run-g1.mjs` |
| `package_integrity` | `sha512-4FSVVjOuNlvT+dBNsEkEZ5ILUfxmhoOdWWMDlCIbYGtZss9mVICT4Yuos5iS2fkJHh1OnAYs1F4PUZpc9NEdCQ==` |
| `node_version` | `v24.22.1` |
| `command` | names the **wrapper** invocation (`node run-g1.mjs --case {case} --tarball {tarball} --out {out}`). The inner CLI argv is recorded per run as `cli.argv_resolved` |

The tarball SHA-256 (`09dca994…125b`, 146449 B) and the extracted CLI SHA-256 (`0a02e469…3052`) are recorded as `observed_identity`, not as pins. The `wrapper_sha256` self-check only guards against accidents. A modified wrapper can skip it. The wrapper's identity is established only when someone outside the runner hashes `run-g1.mjs` and compares it with the pin.

### Errors and what the self-checks cover

An exit code outside `{0,1}` means `REFUSED` or `RUNNER_ERROR`. There is no G1 result in that case. A `RUNNER_INTERNAL_ERROR` before the CLI ran (`cli.spawned:false`) can mean a missing file, so read `detail` in `g1-run-evidence.json`.

The hash self-checks only guard against accidents. The limitation described for `wrapper_sha256` applies in the same way to `manifest.json`, `inputs/` and `runner-pins.json`: a modified runner can skip the checks, and a modified pin file can agree with a modified file. Identity is established only by an outside comparison of the actual bytes with a value obtained separately.

- Full wrapper SHA-256 (`run-g1.mjs`): `cba323d0288327a91828e6de2737e1a1710a78deeb3c0f18c4d611d2e46f90ab`.
- Full companion ZIP SHA-256: `e0c0ef52d39cb8a252c6ca33b18dd4c972ab1bc91d2fc5616eb735be0c5b445f`, 134284 B. The received ZIP and all 19 inner hashes were checked. Its verifier SHA-256 is `f9c68ecc45106b3052e1e082f97ae00d8079e5e75616267e2bc164cb27428c52`; its schema SHA-256 is `735e064bbf352d31fee8d30aed5f13a7bc3875a31af81ea32db3f0dad2d77ece`.

`reference_identity_not_a_pin` in `runner-pins.json` holds reference values that are **not** pins and are not enforced. `observed_identity` in `g1-run-evidence.json` holds what the run actually measured. Compare the two from outside; neither one replaces the pins.

### Tests

```sh
node --test tests/t4-f1-runner.test.mjs
```

The positive C0–C3 tests against a package built from the repo sources run everywhere. The four tests against the actual published tarball are **skipped, not passed**, when `ARC_T4_F1_TARBALL` is not set, the file does not exist, or Node is not v24.22.1. There is no default tarball path; set `ARC_T4_F1_TARBALL` to the tarball path to run them.

### 日本語

**`NOT_FROZEN / LAB_NOT_AUTHORIZED / ERP_NOT_RUN`。**
共同側のT4 v0.3形式に対応する、署名なしのARC部品を出力する候補です。
Ownerから[11月20日の同梱ZIP](https://github.com/boris-ai-sec/ai-security-lab/pull/11#issuecomment-7032466244)を受領し、134284 bytes・SHA-256 `e0c0ef52d39cb8a252c6ca33b18dd4c972ab1bc91d2fc5616eb735be0c5b445f`・内包19ファイルのハッシュが一致しました。
以下の形式は、その実物に基づきます。
C5全体のパッケージ、共同受入、許可済みのラボ実行を意味しません。

公開済みの `@netsujo/agent-role-contracts@1.0.1` のCLI `action-bind` を、固定の `inputs/` に対して実行します（C1は `action.c1.json`）。
署名とERP転送はありません。
ランナーはネットワーク要求を行いませんが、ネットワークの遮断は強制していません。
tarballはメモリ上で読み、一時ディレクトリへ展開して終了時に削除します。

#### C0とC1の実行（リポジトリのルートから）

前提はNode `v24.22.1`（固定値の `node_version`）と、取得済みのパッケージtarballです。
tarballの取得は、オフラインのランナーとは別の事前の手順で、ネットワークが必要です。
チェックアウトの外のディレクトリで実行します。

```text
npm pack --ignore-scripts @netsujo/agent-role-contracts@1.0.1
```

できた `.tgz` の絶対パスを `ARC_T4_F1_TARBALL` に設定し、下のブロックをリポジトリのルートから実行します。
フラグは `--case`、`--tarball`、`--out` を、それぞれ一度だけ、この順で指定します。
`--out` は新しいディレクトリでなければならないため、ブロックはチェックアウトの外に一時ディレクトリを作り、ケースごとに新しい下位ディレクトリを使います。

```sh
ARC_T4_F1_WORK="$(mktemp -d "${TMPDIR:-/tmp}/arc-t4-f1.XXXXXX")"
node --version
node experiments/external-evaluation/t4-f1-inputs/run-g1.mjs --case C0 --tarball "$ARC_T4_F1_TARBALL" --out "$ARC_T4_F1_WORK/c0"
echo "C0 wrapper exit: $?"
node experiments/external-evaluation/t4-f1-inputs/run-g1.mjs --case C1 --tarball "$ARC_T4_F1_TARBALL" --out "$ARC_T4_F1_WORK/c1"
echo "C1 wrapper exit: $?"
```

ラッパーの終了コードは、C0が`0`、C1が`1`の想定です。
C2とC3は `--case` だけを変えた同じコマンドで、想定の終了コードは`0`です。
C1の`1`は想定どおりの拒否（`G1_SUBJECT_MISMATCH`）であり、失敗ではありません。
証跡は各出力ディレクトリの `g1-run-evidence.json` にあります。

#### 終了コード（2層を分けて記録）

| ラッパー終了コード | 意味 | `runner_status` | `g1_verdict` |
| --- | --- | --- | --- |
| `0` | CLI終了`0`、`valid:true`、`execution_authorized:false` | `OK` | `PASS` |
| `1` | CLI終了`1`、`valid:false`かつ`G1_SUBJECT_MISMATCH` | `OK` | `G1_SUBJECT_MISMATCH` |
| `2` | CLI終了`2`（CLI/ファイルエラー、宣言の結果なし） | `RUNNER_ERROR` | `NOT_OBSERVED` |
| `3` | CLI実行前の拒否、またはランナーエラー（タイムアウト、シグナル、起動失敗、非JSON出力、`valid`や`execution_authorized`と矛盾する終了コード） | `REFUSED` または `RUNNER_ERROR` | `NOT_OBSERVED` |

整合するG1観測では、ラッパーはCLIの終了コード`0`または`1`をそのまま返します。
観測したG1の拒否は`1`で終わります。
`{0,1}` の外は、表のとおり`REFUSED`または`RUNNER_ERROR`です。
`exit.json` は `cli` と `wrapper` を別々に持ちます。
出力が矛盾していても、生の `stdout.bin`・`stderr.bin`・終了コードは残します。
拒否のときは `exit.json` と `g1-run-evidence.json` だけを書きます（`cli.spawned:false`）。
`--out` が既に存在する場合は何も書かず、理由をstderrに出します。

ランナーはケースの期待値で結果を採点しません。
`case_expectation` と `observed` を並べて記録するだけです。
`matches_manifest_expectation` は参考情報で、終了コードを変えません。
CLIは、ハッシュ検証済みの入力バイト列そのものを実行用の一時スナップショットから読みます。
全ケースで相対パスを共通にし、C1では検証済みの `action.c1.json` を実行用の `inputs/action.json` として配置します。
元のファイル名は `cli.input_files` に記録します。
検証した同じバイト列から原本5件を保存するため、後から元ファイルを変えても、実行・保存する入力は変わりません。
CLIの出力は、`subject_digest` が `sha256:` と16進64文字でない、`binding_matches_subject` が真偽値でない、`errors` の要素が空でない文字列 `code` を持つオブジェクトでない、または結果が内部で矛盾する場合に、ランナーエラーとします。
PASSは終了コード0・`valid:true`・binding真・エラーなし、`G1_SUBJECT_MISMATCH` は終了コード1・`valid:false`・binding偽が条件です。
形式が正しい想定外の結果は観測であり、ランナーエラーではありません。
照合は検証器の役割です。

#### 証跡

`g1-run-evidence.json` は証跡であり、レシートではありません（署名なし・実行レシートではない）。
`g1_verdict` の範囲は `declaration_consistency_only`（`PASS`はG1宣言の整合のみ）です。
`prior_binding` は `{synthetic:true, authenticated:false}` です。
制限フラグは生の `stdout.bin` から複写し、そのバイト列のSHA-256を添えます。
`sequence` は単調増加の番号で `pins_checked`、`inputs_hashed`、`cli_spawned`、`cli_exited` を記録します。
壁時計の時刻は参考情報です。
`execution_authorized:false` と `not_claimed` は常に含まれます（ERPの効果・無効果の主張なし、C5全体のパッケージではない、共同合意ではない）。

#### 共同側へ渡す部品と実際のコマンド

共同検証器の `--runner-pins` には、生成された **`partner-runner-pins.json`** を渡します。
トップレベルの4項目は `wrapper_sha256`、`package_integrity`、`node_version`、`command` です。
ソース内の `runner-pins.json` は内部設定であり、この引数には渡せません。

出力の `command` は、実際に `spawnSync` へ渡した内側の実行ファイルとargvで、`cli.argv_resolved` と一致します。
先頭はその環境の `process.execPath` の絶対パスです。
後続の共通配列は上の英語節に示したとおりで、private snapshot内の `package/bin/agent-role-contracts.mjs` と `inputs/*.json` を指します。
同じNodeの配置であれば、C1を含む4ケースのcommandは一致します。
Nodeの実行ファイルのパスが変われば固定値も変わります。
端末固有のパスはリポジトリに埋め込まず、テンプレートを実行済みargvとして扱いません。

| 新しい出力ディレクトリ内のファイル | 内容 |
| --- | --- |
| `arc/g1.stdout`、`arc/g1.stderr` | check 4が要求するパスに保存したCLIの生出力。従来の `stdout.bin`・`stderr.bin` と同じバイト列 |
| `arc/g1.exit` | 実際の整数終了コードを10進表記＋LF 1個で保存。POSIXのsignal終了など、整数コードがない場合は生成しない |
| `arc/inputs/{bundle,task,action,binding,action.c1}.json` | 検証済み原本5件。元actionとC1 variantの両方を保持 |
| `partner-runner-pins.json` | 実際の準備実行から得た、共同形式の4つの固定値 |
| `arc-runner.json` | `#/$defs/arc_runner` の部品。公開版1.0.1のsource commitは `873b4104a95e443ba22367cf8378deb7dcbe6cfd` で、ラッパーのPR HEADではない |
| `arc-inputs.json` | `#/$defs/t4-run-open-1/properties/arc_inputs` の部品。C1でも `action_sha256` は元の数量40のactionを指す |
| `arc-c1-variant.json` | `#/$defs/t4-run-open-1/properties/c1_variant` の部品。C1はvariantのハッシュと観測subject、それ以外は `null` |
| `arc-artifacts.json` | `ARC_PARTIAL_ONLY`。生出力・入力の8パスとSHA-256・`size_bytes` の部分一覧で、共同側の完全な証跡indexではない |

5つのJSON部品を生成するのは `runner_status: OK` の場合だけです。
これはG1の観測が内部で整合するという意味で、ケースの期待値を満たしたという判定ではありません。
`REFUSED` とCLIの `RUNNER_ERROR` では部品を生成しません。
証跡の書込に失敗した場合は終了コード`3`を返し、今回作成した部品ファイルを回収して生の証跡を残します。
書込または回収に失敗した出力は、一部のファイルが残っていても不完全で利用できません。
CLIを起動した場合の生出力と検証済み入力は保存し、エラーは `exit.json` と `g1-run-evidence.json` に残します。

生成した固定値も **`ARC_OWNER_PROPOSED / NOT_IN_RC / NOT_JOINTLY_ACCEPTED`（ARC提案・未合意）** のままです。
準備実行で環境ごとの実値を得たあと、共同実行より前に独立した受入と凍結が必要です。
schemaが追加キーを許可しない部品では、提案状態と制限を `g1-run-evidence.json`・`arc-artifacts.json`・本READMEで示します。
Controllerのrun-open・run-receipt、Gateway handoff、完全な証跡indexは作成・署名しません。

#### 同梱物の版と残る共同確認

11月20日のZIPには、LC4を含む8チェックの旧R02案と、補強前のR03案が残っています。
[11月23日の決定](https://github.com/boris-ai-sec/ai-security-lab/pull/11#issuecomment-7093453087)と[Borisの確認](https://github.com/boris-ai-sec/ai-security-lab/pull/11#issuecomment-7099967587)では、LC4を除く7チェックをすべて評価・記録し、R03のforward前照合を補強する方向です。
それらの実装は今回のARC F1接続の対象ではなく、ZIPを最新の共同凍結済み仕様とは扱いません。

共同参照検証器はcheck 4・10を実装していません。
部品のschema照合やcross-caseのcheck 15bだけで、C5全体の `VALID_PASS` にはなりません。
共同F1受入には、実値のrunner pins、C1の順序、署名済みController記録、Gateway handoffとその実装版の確認が残ります。
凍結と実行許可も別の判断です。
相手ファイルはこのrepoに転載せず、ARC自身の実装・入力・接続証拠を提供します。

#### 固定値（`runner-pins.json`）

状態は `ARC_OWNER_PROPOSED / NOT_IN_RC / NOT_JOINTLY_ACCEPTED`（固定値（ARC提案・未合意））です。
ARCの内部設定用レイアウトです。
共同側のflat形式と実際の内側argvには、上記の生成済み `partner-runner-pins.json` を使います。

| 固定値 | 内容 |
| --- | --- |
| `wrapper_sha256` | `run-g1.mjs` のSHA-256 |
| `package_integrity` | `sha512-4FSVVjOuNlvT+dBNsEkEZ5ILUfxmhoOdWWMDlCIbYGtZss9mVICT4Yuos5iS2fkJHh1OnAYs1F4PUZpc9NEdCQ==` |
| `node_version` | `v24.22.1` |
| `command` | **ラッパー**の起動を指します（`node run-g1.mjs --case {case} --tarball {tarball} --out {out}`）。内側のCLIのargvは実行ごとに `cli.argv_resolved` に記録します |

tarballのSHA-256（`09dca994…125b`、146449 B）と展開したCLIのSHA-256（`0a02e469…3052`）は固定値ではなく `observed_identity` として記録します。
`wrapper_sha256` の照合は、うっかりミスを防ぐだけです。
改変したラッパーはこの照合を飛ばせます。
ラッパーの同一性は、ランナーの外の人が `run-g1.mjs` のハッシュを固定値と突き合わせて初めて確かめられます。

#### エラーと自己チェックの範囲

`{0,1}` の外の終了コードは `REFUSED` または `RUNNER_ERROR` で、G1の結果はありません。
CLI実行前の `RUNNER_INTERNAL_ERROR`（`cli.spawned:false`）はファイル欠落を意味することがあるため、`g1-run-evidence.json` の `detail` を確認します。

ハッシュの自己チェックは、うっかりミスを防ぐだけです。
`wrapper_sha256` について述べた限界は、`manifest.json`、`inputs/`、`runner-pins.json` にも同じく当てはまります。
改変したランナーはチェックを飛ばせ、改変した固定値ファイルは改変したファイルと一致できます。
同一性は、別に入手した値と実バイト列をランナーの外で照合して初めて確かめられます。

- ラッパー（`run-g1.mjs`）の完全なSHA-256は `cba323d0288327a91828e6de2737e1a1710a78deeb3c0f18c4d611d2e46f90ab` です。
- 同梱ZIPの完全なSHA-256は `e0c0ef52d39cb8a252c6ca33b18dd4c972ab1bc91d2fc5616eb735be0c5b445f`、134284 B です。受領したZIPと内包19件のハッシュを照合済みです。
- 共同verifierのSHA-256は `f9c68ecc45106b3052e1e082f97ae00d8079e5e75616267e2bc164cb27428c52`、schemaは `735e064bbf352d31fee8d30aed5f13a7bc3875a31af81ea32db3f0dad2d77ece` です。

`runner-pins.json` の `reference_identity_not_a_pin` は参照値で、固定値ではなく、強制もされません。
`g1-run-evidence.json` の `observed_identity` は、その実行で実測した値です。
両者の照合はランナーの外で行い、どちらも固定値の代わりにはなりません。

#### テスト

```sh
node --test tests/t4-f1-runner.test.mjs
```

リポジトリのソースから作ったパッケージに対するC0〜C3の正常系は、どの環境でも動きます。
公開済みtarballに対する4件のテストは、`ARC_T4_F1_TARBALL` が未設定、ファイルがない、またはNodeがv24.22.1でない場合、合格ではなく**スキップ**になります。
既定のtarballパスはなく、実行するには `ARC_T4_F1_TARBALL` にtarballのパスを設定します。

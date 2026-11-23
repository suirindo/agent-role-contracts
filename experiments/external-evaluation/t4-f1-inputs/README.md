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

**`NOT_FROZEN / LAB_NOT_AUTHORIZED / ERP_NOT_RUN`.** ARC-owned candidate; it is not interoperable with the partner verifier. The latest companion ZIP (`e0c0ef52…`, 134284 B) was not available, so integration with it is **blocked**. The partner `--runner-pins` format and the check 4 evidence index paths were not available and were **not guessed**.

```sh
node run-g1.mjs --case C0|C1|C2|C3 --tarball netsujo-agent-role-contracts-1.0.1.tgz --out <new directory>
```

It runs the published `@netsujo/agent-role-contracts@1.0.1` CLI `action-bind` over the fixed `inputs/` (C1 uses `action.c1.json`). Offline: no network, no signing, no ERP forwarding. The tarball is read in memory and unpacked to a temporary directory that is removed on exit.

### Exit codes (two layers, recorded separately)

| Wrapper exit | Meaning | `runner_status` | `g1_verdict` |
| --- | --- | --- | --- |
| `0` | CLI exit `0`, `valid:true`, `execution_authorized:false` | `OK` | `PASS` |
| `1` | CLI exit `1`, `valid:false` with `G1_SUBJECT_MISMATCH` | `OK` | `G1_SUBJECT_MISMATCH` |
| `2` | CLI exit `2` (CLI/file error, no declaration result) | `RUNNER_ERROR` | `NOT_OBSERVED` |
| `3` | Refusal before the CLI ran, or runner error: timeout, signal, spawn error, non-JSON output, exit that contradicts `valid` or `execution_authorized` | `REFUSED` or `RUNNER_ERROR` | `NOT_OBSERVED` |

The wrapper exit is the CLI exit passed through. A rejection (C1) therefore exits `1`, never `0`. Anything outside `{0,1}` is a runner error. `exit.json` holds `cli` and `wrapper` separately (`exit_code`, `argv_resolved`, `reason`). Raw `stdout.bin`, `stderr.bin` and the exit codes are kept even when the output is inconsistent. A refusal writes `exit.json` and `g1-run-evidence.json` only (`cli.spawned:false`). If `--out` already exists, nothing is written and the reason goes to stderr.

The runner does **not** grade the result against the case expectation. `case_expectation` (from `manifest.json`) and `observed` are recorded side by side. `matches_manifest_expectation` is informational and never changes the exit code. A well-formed unexpected outcome is an observation, not a runner error. The comparison belongs to the verifier.

The CLI reads private snapshots of the exact input bytes that were hash-verified (written to the run's temporary directory under the same file names), not the original input paths, so a later change to the originals cannot alter what the CLI consumes. The runner also treats CLI output as a runner error unless `subject_digest` is `sha256:` plus 64 hex characters, `binding_matches_subject` is a boolean, every `errors` entry is an object with a non-empty string `code`, and the result is internally consistent (PASS: exit 0, `valid:true`, binding true, no errors; `G1_SUBJECT_MISMATCH`: exit 1, `valid:false`, binding false). A well-formed unexpected digest or outcome is still only an observation.

### Evidence

`g1-run-evidence.json` is evidence, not a receipt. `g1_verdict` has scope `declaration_consistency_only`. `prior_binding` is `{synthetic:true, authenticated:false}`. The limitation flags are copied from the parsed raw `stdout.bin`, with the SHA-256 of those bytes. `sequence` records `pins_checked`, `inputs_hashed`, `cli_spawned`, `cli_exited` with monotonic counters; the wall-clock time is informational. The unsigned output, `execution_authorized:false` and a `not_claimed` list are always present (no ERP effect or no-effect claim, no partner format, no joint acceptance).

### Pins (`runner-pins.json`)

Status: `ARC_OWNER_PROPOSED / NOT_IN_RC / NOT_JOINTLY_ACCEPTED`. This is ARC's own layout.

| Pin | Value |
| --- | --- |
| `wrapper_sha256` | SHA-256 of `run-g1.mjs` |
| `package_integrity` | `sha512-4FSVVjOuNlvT+dBNsEkEZ5ILUfxmhoOdWWMDlCIbYGtZss9mVICT4Yuos5iS2fkJHh1OnAYs1F4PUZpc9NEdCQ==` |
| `node_version` | `v24.22.1` |
| `command` | names the **wrapper** invocation (`node run-g1.mjs --case {case} --tarball {tarball} --out {out}`). The inner CLI argv is recorded per run as `cli.argv_resolved` |

The tarball SHA-256 (`09dca994…125b`, 146449 B) and the extracted CLI SHA-256 (`0a02e469…3052`) are recorded as `observed_identity`, not as pins. The `wrapper_sha256` self-check only guards against accidents. A modified wrapper can skip it. The wrapper's identity is established only when someone outside the runner hashes `run-g1.mjs` and compares it with the pin.

### Tests

```sh
node --test tests/t4-f1-runner.test.mjs
```

The positive C0–C3 tests against a package built from the repo sources run everywhere. The tests against the actual published tarball are **skipped, not passed**, when the tarball or Node v24.22.1 is missing (set `ARC_T4_F1_TARBALL` to the tarball path).

### 日本語

**`NOT_FROZEN / LAB_NOT_AUTHORIZED / ERP_NOT_RUN`。**
ARC側の候補です。パートナーの検証器とは相互運用できません。
最新の同梱ZIP（`e0c0ef52…`、134284 B）は入手できていないため、ZIPとの統合は**ブロック**中です。
パートナーの `--runner-pins` 形式とcheck 4の証跡パスは未入手で、**推測していません**。

公開済みの `@netsujo/agent-role-contracts@1.0.1` のCLI `action-bind` を、固定の `inputs/` に対して実行します（C1は `action.c1.json`）。
ネットワーク・署名・ERP転送はありません。
tarballはメモリ上で読み、一時ディレクトリへ展開して終了時に削除します。

#### 終了コード（2層を分けて記録）

| ラッパー終了コード | 意味 | `runner_status` | `g1_verdict` |
| --- | --- | --- | --- |
| `0` | CLI終了`0`、`valid:true`、`execution_authorized:false` | `OK` | `PASS` |
| `1` | CLI終了`1`、`valid:false`かつ`G1_SUBJECT_MISMATCH` | `OK` | `G1_SUBJECT_MISMATCH` |
| `2` | CLI終了`2`（CLI/ファイルエラー、宣言の結果なし） | `RUNNER_ERROR` | `NOT_OBSERVED` |
| `3` | CLI実行前の拒否、またはランナーエラー（タイムアウト、シグナル、起動失敗、非JSON出力、`valid`や`execution_authorized`と矛盾する終了コード） | `REFUSED` または `RUNNER_ERROR` | `NOT_OBSERVED` |

ラッパーの終了コードはCLIの終了コードをそのまま渡したものです。
C1の拒否は`1`で終わり、`0`にはなりません。
`{0,1}` の外はランナーエラーです。
`exit.json` は `cli` と `wrapper` を別々に持ちます。
出力が矛盾していても、生の `stdout.bin`・`stderr.bin`・終了コードは残します。
拒否のときは `exit.json` と `g1-run-evidence.json` だけを書きます（`cli.spawned:false`）。
`--out` が既に存在する場合は何も書かず、理由をstderrに出します。

ランナーはケースの期待値で結果を採点しません。
`case_expectation` と `observed` を並べて記録するだけです。
`matches_manifest_expectation` は参考情報で、終了コードを変えません。
CLIは、ハッシュ検証済みの入力バイト列そのものを実行用の一時ディレクトリに同じファイル名で書き出したスナップショットから読みます。元の入力パスは読まないため、後から元ファイルを変更してもCLIが読むバイト列は変わりません。
CLIの出力は、`subject_digest` が `sha256:` と16進64文字でない、`binding_matches_subject` が真偽値でない、`errors` の要素が空でない文字列 `code` を持つオブジェクトでない、または結果が内部で矛盾する場合（PASSは終了コード0・`valid:true`・binding真・エラーなし、`G1_SUBJECT_MISMATCH` は終了コード1・`valid:false`・binding偽）に、ランナーエラーとします。形式が正しい想定外のdigestや結果は、これまでどおり観測値として扱います。
形式が正しい想定外の結果は観測であり、ランナーエラーではありません。
照合は検証器の役割です。

#### 証跡

`g1-run-evidence.json` は証跡であり、レシートではありません（署名なし・実行レシートではない）。
`g1_verdict` の範囲は `declaration_consistency_only`（`PASS`はG1宣言の整合のみ）です。
`prior_binding` は `{synthetic:true, authenticated:false}` です。
制限フラグは生の `stdout.bin` から複写し、そのバイト列のSHA-256を添えます。
`sequence` は単調増加の番号で `pins_checked`、`inputs_hashed`、`cli_spawned`、`cli_exited` を記録します。
壁時計の時刻は参考情報です。
`execution_authorized:false` と `not_claimed` は常に含まれます（ERPの効果・無効果の主張なし、パートナー形式ではない、共同合意ではない）。

#### 固定値（`runner-pins.json`）

状態は `ARC_OWNER_PROPOSED / NOT_IN_RC / NOT_JOINTLY_ACCEPTED`（固定値（ARC提案・未合意））です。
ARC独自のレイアウトです。

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

#### テスト

```sh
node --test tests/t4-f1-runner.test.mjs
```

リポジトリのソースから作ったパッケージに対するC0〜C3の正常系は、どの環境でも動きます。
公開済みtarballに対するテストは、tarballまたはNode v24.22.1がなければ、合格ではなく**スキップ**になります（`ARC_T4_F1_TARBALL` でtarballを指定できます）。

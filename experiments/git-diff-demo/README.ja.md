# 単体テストはPASSするが、ARCのscope検査は1つのパスを検知する

[English](README.md)

2つのパッチのどちらでも単体テストはPASSします。ARCの宣言検査は、宣言済みの書込み権限の外にある変更パス1件を検知します。

テストはコードが動くかを見ます。ARCは、渡された変更パスが宣言済みの書込み権限に収まるかを見ます。この2ケースでは、2つの答えが分かれます。

## 前提条件

Git 2.32以上と**Node.js 22.5以上**。`npm install`、アカウント、APIキー、エージェントは不要です。ネットワークを使うのはcloneのときだけで、デモはオフラインで動きます。

動作確認はGit 2.39.3とNode.js 24.11.1です。Gitの最低バージョンはデモが使うフラグから決めたもので、それより古いバージョンでは実行していません。

## 実行する

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
node agent-role-contracts/experiments/git-diff-demo/run.mjs
```

Bash、Docker、特定のカレントディレクトリ、エディタには依存しません。cloneには何も書き込まず、一時ファイルは削除します。

## 何が起きるか

1. 一時Gitリポジトリで、`git apply --index`により2つのパッチ（A、次に新しいコピーでB）を当てます。
2. それぞれで、同じ単体テストファイルを`node --test`で実行します。
3. デモ自身がGitから変更パスを列挙し、パスごとに、このcloneのARC CLIの実際の`explain`を実行します。各実行では、scopeをそのパスに書き換えたタスクのコピーを使います。

宣言済みの書込み権限は`src/greet.mjs`の1ファイルだけです。パッチBは、パッチAとバイト単位で同一の変更に、`config/release.json`への編集を1件加えたものです。

### Expected output

```text
ARC #130 demo: unit tests pass, the scope check still flags the extra file.
Declared write authority: src/greet.mjs

Case A: allowed patch
  Changed paths (from Git): src/greet.mjs
  Unit tests (node --test): PASS (exit 0)
  ARC explain src/greet.mjs: PASS (exit 0)

Case B: same patch + one out-of-scope edit
  Changed paths (from Git): config/release.json, src/greet.mjs
  Unit tests (node --test): PASS (exit 0)
  ARC explain config/release.json: FAIL (exit 1) TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY
  ARC explain src/greet.mjs: PASS (exit 0)

Result: tests passed in both cases; ARC flagged 1 path in case B: config/release.json
Demo complete: every observed result matched the expectation (demo exit 0).
Checked by ARC 1.0.1: each path this demo listed from Git, against the declared authority.
Not checked: code correctness, who made the change, or whether any write was blocked.
```

デモの終了コードは**0**です。`FAIL (exit 1)`の行は、そのパスについて期待どおりのARCの結果であり、デモ自身の終了コードではありません。ARCのバージョンは、CLIに`--version`コマンドがないため、JSONレポートから取り、`package.json`と照合しています。

## 読み方

| ケース | 変更パス | 単体テスト | ARC（パス別） | 意味 |
| --- | --- | --- | --- | --- |
| A | `src/greet.mjs` | PASS | PASS | 変更パスは宣言済みの権限内の1件だけです。 |
| B | `config/release.json`、`src/greet.mjs` | PASS | `config/release.json`：FAIL `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`、`src/greet.mjs`：PASS | テストは余計なファイルを見ません。宣言検査はそのパスを名指しします。 |

## 確認したこと・確認していないこと

- ARCはGitやファイルの中身を読みません。パスを列挙して1件ずつARCに渡すのはデモであり、列挙されなかったパスは検査されません。
- ARCは書込みを止めません。ケースBでは範囲外のファイルが実際に変更され、テストもPASSしています。
- PASSは、コードが正しい、または安全であることを意味しません。
- PASSは、誰が変更したか、レビュー担当者が独立していることを証明しません。
- 通常のNodeコマンドです。CursorやClaude Codeで自動的には動かず、エディタ別の手順はここでは検証していません。

## DEMO_ERRORが出たら

デモは終了コード**2**で終了し、stdoutには何も出しません。途中までの結果が成功のように見えることはありません。メッセージにパスまたは手順が示されます。デモを通すために、権限を広げたりパッチを編集したりしないでください。

| メッセージの先頭 | 原因 | 対処 |
| --- | --- | --- |
| `git was not found` / `unsupported Git version` | Gitがない、または2.32より古い。 | Git 2.32以上を入れて再実行します。 |
| `unsupported Git change` | Gitがrename、copy、削除、種別変更、未追跡、ignore対象、submodule、衝突、作業ツリーのみの変更、または特殊なファイルモードを報告した。 | デモは追加・変更された追跡ファイルだけを扱い、推測せずに止まります。 |
| `a path from Git is not valid UTF-8` | パスをデコードできない。 | パスを直します。デモは文字コードを推測しません。 |
| `Git reported no changed paths` | パッチが何も変更しなかった。 | 空の一覧はPASSに見えてしまうため止めています。同梱のパッチを復元します。 |
| `case B expected ARC to reject` / `case A expected ARC to accept` | 宣言またはfixtureが変わった。 | クリーンなcloneから同梱のfixtureを復元します。 |
| `unit tests failed` | 単体テストが失敗した、または1件も実行されなかった。 | ARCの結果を比べる前に、両ケースでテストがPASSする必要があります。 |
| `ARC explain could not read its input` | ARC CLIが終了コード2で終了した、または見つからない。 | このリポジトリの完全なcloneから実行します。 |

## 自分のリポジトリで使う

1. [FIRST-TASK](../adoption/FIRST-TASK.ja.md)に沿って、bundleの`allowed_write_scopes`を、実際に許す粒度で書きます。広く書くほど、ARCが検知できるものは減ります。
2. 変更パスは、自分でレビューした方法で列挙します。このデモの列挙は、追加と変更だけに対応しています。未追跡、ignore対象、rename、削除、submoduleをどう扱うかを決め、決めていない種別では止めてください。
3. パスごとに`explain`を実行します。終了コード1は、そのパスが宣言の検査を通らなかったことを表し、理由は二つあります。`TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`は、宣言した権限の外のパスです。`TASK_WRITE_SCOPE_INVALID`は、ARCがportable scopeとして受け付けないパスです。各セグメントはASCIIの英数字で始まり、その後は英数字と`.`、`_`、`-`だけを使えます。先頭のドットは、最初のセグメントが`.github`の場合だけ許されます。空白、日本語名、`@`を含むパスや`.env`のような名前はINVALIDで、宣言を広げても解決しません。どちらのコードでも止めてください。INVALIDのtext出力はパスを示さないことがあるため、結果ごとにパスを自分で記録します。終了コード2は入力またはCLIのエラーで、パスに対する判定ではありません。
4. テストは今までどおり流します。ARCはテストの代わりにならず、テストもARCの代わりになりません。
5. CIとhookは[入口の一覧](../adoption/README.ja.md)を使います。consumer starterはcore 1.0.0に固定されています。
6. [CLAUDE.md.exampleとarc.mdc.example](../adoption/integrations/)は指示ベースのテンプレートです。実際に実行されるかは自分で確認してください。

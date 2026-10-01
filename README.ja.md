# Agent Role Contracts

**役割・権限宣言・引き継ぎの矛盾を、エージェントを起動せずに検査する。**

Version `0.1.0` は、宣言された役割・権限・レビュー分離・作業範囲・引き継ぎを検査します。runtime権限の付与、本人確認、エージェント実行、OSやGitHubの権限制御は行いません。

## 3分で体験する Quick Start

**前提条件：GitとNode.js 22.5以上（npm同梱）。** 次の2コマンドでデモを実行できます。

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
npm --prefix agent-role-contracts run demo --silent
```

`npm install`、APIキー、エージェントの実行環境、アカウントは不要です。ネットワーク接続はclone時だけ使い、デモはオフラインで動きます。BashやDockerにも依存しません。

実際の検査器を呼び出して、次の流れを確認します。

1. `src/**`の範囲内にある`src/example.mjs`のタスクは`PASS`する。実装役とread-onlyのレビュー役も表示する。
2. 範囲外の`secrets/production.txt`を要求すると、`TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`を検知する。
3. タスクJSONのscopeをメモリ内で`src/example.mjs`に戻すと、再び`PASS`する。

最後に`Demo complete: PASS -> FAIL (expected) -> PASS.`が表示され、終了コード0になります。想定した不整合の検知も含めて、デモの成功です。ファイル不足や想定外の結果は`DEMO_ERROR`を表示して終了コード2になります。対象scopeのファイルを開いたり、エージェントを起動したりはしません。

期待出力の全文は英語正本の[Expected output](README.md#expected-output)に記載しています。

公開済みnpm `0.1.0`をcloneせず試す手順は、英語正本の[Try the published package instead](README.md#try-the-published-package-instead-no-clone)にあります。GitHub上のデモとnpm公開版は更新時点が異なる場合があります。

### 何が変わるか

プロンプトで`src/**`への限定を指示していても、次のタスクが別の場所を要求することがあります。役割とタスクの宣言を検査器へ渡すと、その不整合を具体的な診断コードで確認できます。実装役とレビュー役の兼務宣言も検知します。PASSは宣言の整合を示し、実際の権限制御やレビュー担当者の独立性確認は実行側で行う必要があります。

次は[タスクのscopeを変更して自分で検査する](docs/QUICKSTART.md)、[詳細な3-role例](#詳細な3-role例)、[構成と互換性の境界](docs/COMPATIBILITY.md)へ進めます。改善提案は[Contributing](CONTRIBUTING.md)と[Issues](https://github.com/suirindo/agent-role-contracts/issues)を参照してください。

## 詳細な3-role例

starterの後は、coordinator、条件付きinput、handoffを含む詳細例を使えます。

```sh
node bin/agent-role-contracts.mjs validate --bundle examples/team.json
node bin/agent-role-contracts.mjs explain --bundle examples/team.json --task examples/task.json --format text
node bin/agent-role-contracts.mjs handoff --bundle examples/team.json --task examples/task.json --handoff examples/handoff.json
```

自己レビューを含む不正なbundleもあります。

```sh
node bin/agent-role-contracts.mjs validate --bundle examples/invalid-self-review.json
```

`SELF_REVIEW_DECLARED`が表示され、終了コード1になります。`another-team.json`では別のrole ID・repository参照、`code-task.json`では別routeの条件付き必須inputを確認できます。

CIマトリクスは Ubuntu / Node.js 22.5.0、Ubuntu / Node.js 24、macOS / Node.js 22、Windows / Node.js 22 を対象にします。各候補は必ずそのexact HEADで通過する必要があり、過去候補の成功は現在のbytesへ流用しません。22.5.0は最小互換性確認用で、実運用への導入推奨ではありません。独立した受入は別途必要です。

## 何を検査するか

契約の必須項目・列挙値・配列重複、役割IDと別名の衝突、委譲先・報告先の参照と循環、許可と禁止の矛盾、read_onlyと書き込み範囲の矛盾、宣言上の実装役とレビュー役の兼務を検査します。条件付き必須入力、明示的なタスク種別の担当関係、知識ID、引き継ぎのタスク・目的・宛先・状態整合も対象です。

経路は利用者が宣言したルールだけです。未知の種別を別タスクへ自動変換せず、モデル品質や成功率を推定しません。初期版はタスク入力を全参加役に共通で渡して検査するため、段階ごとに後から生成される入力の自動充足は扱いません。routed executorが`write_scoped`または`operator`の場合、`inputs.scope`はportableな相対scopeであり、そのexecutorの`allowed_write_scopes`のいずれかに包含される必要があります。さらに`write_scoped` / `operator` roleは、bundle policyの`read_only_forbids`に列挙されたcapabilityを最低1つ実際に許可していなければなりません。Coreはcapability名から書き込み意味を推測しません。これは宣言同士の包含・整合検査だけで、filesystemを開かず、globを展開せず、runtimeのアクセス権を付与しません。`human_only` roleはexecutable `capabilities`と`allowed_write_scopes`の両方を空にする必要があり、人間の判断・承認境界を表しますがmachine mutation authorityは表しません。

## 検査しないこと

PASSは**宣言同士の整合**だけを意味します。実際の担当者・runtimeの同一性、レビューの独立性、証拠の真正性、ファイルの存在、機密情報の網羅検出、成果物の品質、mergeや公開の許可は証明しません。`output_schema`は出力形式の宣言データとして保持しますが、成果物や任意の出力スキーマを検証しません。

結果には常に`execution_authorized=false`、`runtime_enforcement=false`、`identity_verified=false`、`evidence_verified=false`、`source_files_checked=false`、`sensitive_data_scanned=false`、`output_schema_validated=false`を付けます。

runtime固有宣言の検出は意図的に限定されています。汎用的なruntime設定キーの一部と、選択した`.claude` / `.codex`パス形式を検出しますが、あらゆるruntime固有表現を網羅するものではありません。runtime中立性の証明でも、セキュリティ・秘密情報・マルウェア・プロンプト安全性のスキャナでもありません。

実サービスへ組み込む際の本人確認、独立レビュー、証拠、人間の承認、鮮度、実行権限の境界は[Integration guide](docs/INTEGRATION.md)を参照してください。

## 自分の設定へ変更する

`examples/team.json`をコピーし、役割・本文・capability一覧・read_onlyで禁止するcapability・knowledge・routesを編集します。社内registryやHOMEディレクトリの探索はありません。`body`は役割本文を明示的に埋め込む場所です。公開contractにprompt-file path fieldはなく、Coreは`ROLE.md`その他の役割ファイルを探索しません。

`allowed_write_scopes`は相対ファイル/ディレクトリ名、または末尾`/**`という宣言書式に限定します。globの展開や実際のアクセス制御は行いません。routesやhandoffは別名でなくcanonical role IDを使います。optional knowledgeも、名前を記載した場合は参照先の宣言が必要です。

## インストール

```sh
npm install @netsujo/agent-role-contracts
```

## APIとCLI

```js
import { validateBundle, explainTask, validateHandoff } from '@netsujo/agent-role-contracts';
// 文字列は呼出元が明示的に読み込んだJSON。JSオブジェクト/設定コードは受け付けません。
const result = validateBundle(bundleJsonText);
const plan = explainTask(bundleJsonText, taskJsonText);
const receipt = validateHandoff(bundleJsonText, taskJsonText, handoffJsonText);
```

CLIは指定した通常ファイルだけを読み、stdout/stderrへ結果を書きます。終了コード0は整合、1は契約不整合、2は引数・読込の問題です。安定した最終パス要素のsymlinkは対応CI環境で拒否します。POSIXでは`O_NOFOLLOW`を維持し、Windowsではopen前の`lstat`検査を追加しています。ただしこれはfilesystem sandboxではなく、Windowsで別プロセスが検査とopenの間にパスを差し替える状況まで防止すると主張しません。

入力上限は各1 MiB、JSONのネスト64段、ノード50,000個。重複キー、非有限数、安全な整数範囲外、予約キー`__proto__`は拒否します。通常のデータキーとしての`prototype`・`constructor`は許容します。任意のJS設定、shell、プラグイン、URL取得、エージェント起動を実行する入口はありません。同一JSプロセス全体が侵害されている状況に対するセキュリティ境界ではありません。

## 検査器の対応範囲

同梱スキーマはDraft-07の形式です。検査器は同梱スキーマで使うキーワードだけを扱う限定実装です。JSON Schema一般実装ではありません。未対応のキーワードやdialectはエラーにします。利用者が任意スキーマを登録して実行する公開APIはありません。詳細は`docs/SCHEMA_PROFILE.md`を参照してください。

## 開発用確認

```sh
npm run check
```

ソースのテストと、schema JSONから生成したデータモジュールの一致を確認します。`schemas/`が正本です。変更後は`npm run schemas:build`で再生成します。生成物は実行コードを評価する仕組みではなく、静的なスキーマデータです。

抽出元との互換・非互換境界は`docs/COMPATIBILITY.md`、公開版の受入方針は`docs/RELEASE_GATES.md`に記載しています。

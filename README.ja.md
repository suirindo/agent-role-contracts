# Agent Role Contracts

**役割・権限宣言・引き継ぎの矛盾を、エージェントを起動せずに検査する。**

**開発プレビュー：`0.5.0-alpha.1`。** npmの公開版は引き続き`0.1.0`です。既存の汎用v0.1 role-contract profileと同期APIを維持し、v0.2金融プレビューは用途別の拡張として提供します。

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

公開済みnpm `0.1.0`をcloneせず試す手順は、英語正本の[Try the published package instead](README.md#try-the-published-package-instead-no-clone)にあります。現在のrepository sourceはnpm公開版より新しいため、両者を同一の機能集合として扱わないでください。

### 何が変わるか

プロンプトで`src/**`への限定を指示していても、次のタスクが別の場所を要求することがあります。役割とタスクの宣言を検査器へ渡すと、その不整合を具体的な診断コードで確認できます。実装役とレビュー役の兼務宣言も検知します。PASSは宣言の整合を示し、実際の権限制御やレビュー担当者の独立性確認は実行側で行う必要があります。

次は[タスクのscopeを変更して自分で検査する](docs/QUICKSTART.md)、[詳細な3-role例](#詳細な3-role例)、[構成と互換性の境界](docs/COMPATIBILITY.md)、[実サービス統合時の責任境界](docs/INTEGRATION.md)へ進めます。改善提案は[Contributing](CONTRIBUTING.md)と[Issues](https://github.com/suirindo/agent-role-contracts/issues)を参照してください。

## 汎用コアと用途別拡張

Agent Role Contractsは、AIの役割・権限・作業範囲・レビュー・引き継ぎの宣言を検査する汎用OSSです。ソフトウェア開発・データ処理・問い合わせ返信の下書きは同じコアを利用し、オンチェーン金融は用途別拡張の一つに位置付けます。

同じ契約を使う3つの非金融デモを実行できます。

```sh
npm --prefix agent-role-contracts run demo:general --silent
```

この未公開のソース候補では、汎用入口`@netsujo/agent-role-contracts/core`と用途別入口`@netsujo/agent-role-contracts/profiles/onchain-finance`を追加しています。従来のroot importは互換維持します。`/core`は金融コード・金融スキーマを読み込みません。互換rootは既存の金融exportも保持します。古いnpm導入版に新しい入口が存在するとは主張しません。

デモは出力ファイルに関する宣言検査です。業務の実行・顧客への送信・成果物の真正性確認は行いません。[汎用設計と進化計画](docs/ARCHITECTURE.md)を参照してください。

## G1 タスク・アクションbinding

G0のcore分離とG1のタスク・アクションbindingは**merge・実装済み**です。sourceのmergeはnpm公開や利用者による採用を意味しません。[非金融bindingデモ](examples/action-binding/demo.mjs)は汎用fixtureを再利用し、ソフトウェア変更・データクリーニング・問い合わせ返信の下書きを扱います。

```sh
node examples/action-binding/demo.mjs
```

`/core`は非同期API `describeTaskAction(bundleJson, taskJson, actionJson)`と`validateTaskActionBinding(bundleJson, taskJson, actionJson, bindingJson)`を公開します。`npm run demo:binding`で実行できます。actionとbindingのJSONは`schema_version: "0.3"`、binding profileは`task-action/0.3`です。開発版は未公開です。action IDはtask/runのリプレイ識別子を保証せず、リプレイ方針は外部で扱います。

各例でdigestを取得し、routeのreviewerによるpassと`route.accountable`による必須承認を宣言してPASSを確認します。その後、意味のあるtask入力またはaction parameterを変更し、元のbindingが`G1_SUBJECT_MISMATCH`で失敗することを確認します。完全なcanonical subjectはprofile、**policy・roles・routesを含むbundle全体、task全体、宣言action全体**を対象とし、レビュー・承認の宣言は現在のsubjectに結び付きます。

digestが示すのは整合対象の完全性であり、真正性や実行許可ではありません。デモはactionを実行せず、reviewer・approverの本人確認もしません。flat scalarのaction parametersは宣言データのみです。G2は以下の限定的なfilesystem-write adapterを提供しますが、parameter名だけからtool動作やresource権限を推定しません。成果物のpath・URLは不変の証拠ではなく、正確な成果物bytesの完全性は信頼できる統合側で別途扱う必要があります。G1は汎用機能であり、金融は引き続き任意profileです。

## G2 filesystem-write adapter

G2 filesystem-writeは**repository mainにmerge済み・実装済み**です。npm公開・本番採用は主張しません。最初の具体的adapterにfilesystem-writeを選ぶ理由は、既存のportableな相対scopeの意味を、業界固有schemaなしでソフトウェア変更・データクリーニング・サポート下書きに再利用できるためです。G3 lifecycleも現在のmainにmerge済み・実装済みですが、sourceは未公開です。

optional APIは次のとおりです。

```js
import { validateFilesystemWriteMapping } from '@netsujo/agent-role-contracts/adapters/filesystem-write';
const result = await validateFilesystemWriteMapping(bundleJson, taskJson, actionJson, mappingJson);
```

profileは`filesystem-write/0.1`、mappingの`schema_version`は`"0.1"`です。G1 actionは`schema_version: "0.3"`、kindは`filesystem-write`、parametersは厳密に`{path, content_sha256}`です。mappingは`subject_digest`、operation `write_file`、同じ`path`と`content_sha256`を宣言します。対応するoperationはこの1種類だけで、未知のparameter・semanticsを拒否し、task scopeと実行役の宣言権限を検査します。任意のSaaS・database・API・その他resourceの意味には対応しません。

`content_sha256`は呼出元が供給する、宣言上の完全性識別子です。成果物bytesの読込・検証、filesystem状態・pathの存在確認は行いません。mappingのPASSは宣言の整合だけを示し、権限付与・実行・レビュー承認を意味しません。executorの本人確認も、アクセス権の強制も行いません。G1のレビュー・承認bindingは現在の完全なsubjectに対する別の検査であり、adapterは承認を生成しません。金融・Safeは引き続き任意profileです。

[filesystemデモ](examples/filesystem-write-adapter/demo.mjs)は汎用scenario builderとfixtureを再利用し、`src/example.mjs`、`reports/cleaned.csv`、`drafts/reply.md`への書込宣言を扱います。各例で一致するmappingのPASSを確認後、pathまたはcontent digestを変更し、特定の診断で失敗することを要求します。digestは架空で、対象ファイルは開かず書き込みません。

```sh
node examples/filesystem-write-adapter/demo.mjs
```

この未公開候補にはoptional adapter subpathが含まれます。公開済みnpm版の対応を主張しません。[例の補足](examples/filesystem-write-adapter/README.md)も参照してください。

## G3 lifecycle宣言

G3 lifecycleは**repository mainにmerge済み・実装済み**です。リリース済み・採用済みではありません。[デモとAPI説明](examples/task-lifecycle/README.md)はソフトウェア変更・データクリーニング・返信下書きで、3件のPASSと古いsubject・成果物digest衝突の拒否を確認します。

```sh
npm run demo:lifecycle
```

現在の未公開sourceでは、rootと汎用`/core`が`describeTaskAction`・`describeTaskLifecycle`・`validateTaskLifecycle`を提供します。lifecycleのschema versionは`0.4`、profileは`task-lifecycle/0.4`で、現在のG1 subject digestに結び付きます。G0・G1・G2・G3はrepository mainにmerge済み・実装済みです。G2 filesystem-writeは明示的なoptional subpath `/adapters/filesystem-write`のままで、root・`/core`から再exportしません。mergeはnpm公開・本番採用・runtime権限・deploymentを意味しません。finance・Safeは任意profileです。

lifecycle PASSは宣言の整合だけを示し、eventの真実性・認証・artifact bytesの検証・runtime受入を意味しません。外部`run_id`は呼出元が供給する相関IDであり、リプレイ防止ではありません。event decisionは宣言で、認証済みイベントではありません。artifactの`sha256`は宣言された識別情報で、bytesを読込・検証せず、locatorも取得しないmetadataです。lifecycle整合、artifact identity整合、真正性、runtime受入は別の問題です。実行、本人確認、レビュー・承認の真正性検証、timestamp・clock検査・state-machine順序保証は行いません。package公開は主張しません。

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

## 任意のオンチェーン金融プレビュー

資金移動やトークン承認の提案を、チェーン・送信元・送金先/spender・資産・金額・手数料の宣言上の上限と照合します。役割bundle、タスク、金融ポリシー、提案全体のSHA-256に、simulation・独立roleのレビュー・人間承認を結び付けます。alpha.2では実行後receiptについても、同じsubject・chain・nonceとの整合を検査できます。

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
npm --prefix agent-role-contracts run demo:finance --silent
npm --prefix agent-role-contracts run demo:safe --silent
```

英語デモでは、正常な支払い、チェーン違い、上限超過、無制限approval、レビュー後の提案変更、更新後の架空宣言、整合するexecution receipt、nonce不一致のreceiptまで検査します。GitとNode.js 22.5以上（npm同梱）が必要です。clone後はオフラインで動き、install・ウォレット・APIキー・providerアカウントを要求しません。

任意のSafe profileは、供給された単一CALL envelopeの対応フィールドをintentと照合し、`safe_call_envelope_matches_intent`で結果を返します。Safeの正規serialization・transaction hash・owner・threshold・署名・custody・実行権限は検証しません。`transaction_serialization_verified`は常にfalseです。

対象はnative送金、標準ERC-20送金、上限付きERC-20承認の宣言です。金額はuint256の整数文字列で比較します。execution receiptも呼出元が供給する宣言であり、実チェーン上の真正性を認証しません。PASSは宣言の整合を示すだけで、チェーン状態、simulation・承認・receiptの真正性、署名・送信、実際の上限強制、金融取引の安全性は証明しません。[仕様・API・利用例](examples/onchain-finance/README.md)を参照してください。

v0.1 profileは、宣言された役割・権限・レビュー分離・作業範囲・引き継ぎを検査します。runtime権限の付与、本人確認、エージェント実行、OSやGitHubの権限制御は行いません。

## 何を検査するか

契約の必須項目・列挙値・配列重複、役割IDと別名の衝突、委譲先・報告先の参照と循環、許可と禁止の矛盾、read_onlyと書き込み範囲の矛盾、宣言上の実装役とレビュー役の兼務を検査します。条件付き必須入力、明示的なタスク種別の担当関係、知識ID、引き継ぎのタスク・目的・宛先・状態整合も対象です。

経路は利用者が宣言したルールだけです。未知の種別を別タスクへ自動変換せず、モデル品質や成功率を推定しません。初期版はタスク入力を全参加役に共通で渡して検査するため、段階ごとに後から生成される入力の自動充足は扱いません。routed executorが`write_scoped`または`operator`の場合、`inputs.scope`はportableな相対scopeであり、そのexecutorの`allowed_write_scopes`のいずれかに包含される必要があります。さらに`write_scoped` / `operator` roleは、bundle policyの`read_only_forbids`に列挙されたcapabilityを最低1つ実際に許可していなければなりません。Coreはcapability名から書き込み意味を推測しません。これは宣言同士の包含・整合検査だけで、filesystemを開かず、globを展開せず、runtimeのアクセス権を付与しません。`human_only` roleはexecutable `capabilities`と`allowed_write_scopes`の両方を空にする必要があり、人間の判断・承認境界を表しますがmachine mutation authorityは表しません。

## 検査しないこと

PASSは**宣言同士の整合**だけを意味します。実際の担当者・runtimeの同一性、レビューの独立性、証拠の真正性、ファイルの存在、機密情報の網羅検出、成果物の品質、mergeや公開の許可は証明しません。`output_schema`は出力形式の宣言データとして保持しますが、成果物や任意の出力スキーマを検証しません。

結果には常に`execution_authorized=false`、`runtime_enforcement=false`、`identity_verified=false`、`evidence_verified=false`、`source_files_checked=false`、`sensitive_data_scanned=false`、`output_schema_validated=false`を付けます。

runtime固有宣言の検出は意図的に限定されています。汎用的なruntime設定キーの一部と、選択した`.claude` / `.codex`パス形式を検出しますが、あらゆるruntime固有表現を網羅するものではありません。runtime中立性の証明でも、セキュリティ・秘密情報・マルウェア・プロンプト安全性のスキャナでもありません。

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

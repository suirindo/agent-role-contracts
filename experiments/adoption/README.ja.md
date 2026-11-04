# 既存の開発手順で ARC を試す

[English](README.md) | 日本語

この実験用キットは、公開済みの **Agent Role Contracts 1.0.0** を自分のリポジトリで試すためのものです。キット自体はソースリポジトリで配布しており、公開済みの npm 1.0.0 パッケージには含まれていません。連携用のテンプレートは任意の設定例です。認定済みの連携や、実行時に権限を強制する仕組みではありません。

まず単独のプロジェクトで確認し、その後に使う連携を一つ選びます。八つの連携例は同じ宣言チェックを呼び出すため、すべてを導入する必要はありません。

## 自分の用途に合うか確かめる

| 確認したいこと | 次に進む先 |
| --- | --- |
| 作業前に、タスクの書き込み範囲と宣言されたレビューの役割を照合したい | 以下の試用を行い、[自分のタスクを記述する](FIRST-TASK.ja.md) |
| 利用側の依存をインストールする前に、拒否される例を見たい | 既存の[ソース版デモ（英語）](../../docs/QUICKSTART.md#run-the-demo) |
| JSON の形、コードの正しさ、実際に変更したファイルを確認したい | 既存のスキーマ検証、テスト、差分レビューを使う |
| 実行中の権限、実行者の認証、承認を強制したい | 既存の IAM、サンドボックス、承認の仕組みを使う |
| 既存の CI、スキーマ、IAM、レビューで課題を解決できている | その仕組みを維持する。残っている宣言の不整合を挙げられなければ、試用を追加しない |

## 1. 単独のプロジェクトで試す

[Git](https://git-scm.com/downloads)、[Node.js](https://nodejs.org/en/download) 22.5 以降、npm が必要です。`agent-role-contracts` と `arc-check` がまだ存在しないディレクトリで、次を実行します。すでに同名のディレクトリがある場合は、別の作業場所を選んでください。

PowerShell では、この手順の `npm` を `npm.cmd`、`npx` を `npx.cmd` として実行します。実行ポリシーを変更する必要はありません。終了コードは各コマンドの直後に `$LASTEXITCODE` で確認し、macOS／Linux の POSIX shell では `echo $?` を使います。

```sh
git clone --depth 1 https://github.com/suirindo/agent-role-contracts.git
git -C agent-role-contracts rev-parse HEAD
node -e "require('node:fs').cpSync('agent-role-contracts/experiments/adoption/consumer','arc-check',{recursive:true,force:false,errorOnExist:true})"
cd arc-check
npm install --ignore-scripts
npm run arc:check
```

表示されたソースのコミットを、固定されたコアのバージョン `1.0.0` とは分けて記録します。この試用用プロジェクトは、固定したコアの依存だけをインストールします。生成された lockfile を確認して保存してください。最後のコマンドは、同梱の宣言に対して PASS を表示し、終了コード 0 を返す想定です。

通常のタスクを上書きせず、範囲外の例も確認します。

```sh
npx --no-install agent-role-contracts explain --bundle .arc/bundle.json --task .arc/task-outside-scope.json --format text
```

この例は `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` と終了コード 1 で拒否されるのが正しい結果です。公開版 1.0.0 では、壊れた JSON は `JSON_INVALID` と終了コード 1 になります。入力ファイルを読めない場合は終了コード 2 です。読取失敗を、宣言のチェックが通った結果として扱わないでください。

同じ `arc-check` ディレクトリで、インストールと、正常・範囲外・読取不能の各結果をまとめて確認できます。

```sh
node scripts/verify-setup.mjs
```

この補助スクリプトは、依存のインストール、ファイルの変更、外部サービスへの通信を行いません。すべての結果が想定どおりなら 0、準備不足や想定外の結果があれば 2 を返します。これはコアの終了コード 0／1／2 とは別の判定です。自分のタスクや連携先で実行できたことまでは示しません。

## 2. 自分のリポジトリで最初のタスクを記述する

テンプレートは、利用側のリポジトリのルートに `package.json`、`.arc/`、`scripts/` がある構成を想定しています。同梱の `.arc/` の内容を確認し、宣言済みの範囲内に収まるタスクを選びます。役割や許可範囲を変更するときも、権限を定義する bundle は既存の信頼できるレビュー手順で管理してください。

既存の `package.json` に、開発用依存 `@netsujo/agent-role-contracts@1.0.0` と `arc:check` スクリプトを追加します。記述は[同梱の package.json](consumer/package.json)を参照し、ファイル全体を置き換えず、ほかの設定を残してください。`--ignore-scripts` を付けてインストールし、lockfile を保存したうえで、実際に使うタスクを指定してチェックします。

[最初のタスクを書く手順](FIRST-TASK.ja.md)では、同梱の bundle を変えずに、タスクの ID、種類、目的、範囲、受入条件を記述します。正常な宣言を確認し、範囲外への変更が拒否されることを確かめてから、元の範囲へ修復します。

ARC が読むのは宣言です。Git の差分や、scope が指すソースファイルは読みません。実際に変更したファイルを宣言から漏らしても、チェックが通る場合があります。タスクの scope と実際の変更は、別途照合してください。同じ未信頼の変更に含まれる task と拡張済み bundle を一緒にチェックすると、拡張後の範囲で通る場合もあります。後述の GitHub Actions 例は、二つの入力元を分けます。

### 公開版 1.0.0 で使える scope

新しいソースのコミットからキットをコピーしても、利用側のコアは **公開版 1.0.0** に固定されています。同梱 bundle の許可範囲 `src/**` に対する違いは次のとおりです。

| タスクの scope | 公開版 1.0.0 | ソースの main |
| --- | --- | --- |
| `src/example.mjs`、`src/nested/file.mjs`、`src/**` | 受理する | 同じ |
| `src2/example.mjs` | `src/**` の範囲外として拒否する | 同じ |
| `.github/workflows/arc.yml` | `.` で始まるパス要素として拒否する | ルートの `.github` を明示した、適切な許可範囲がある場合のみ扱える。同梱の `src/**` では範囲外 |
| `src/.hidden`、`../src/file.mjs`、`/tmp/file.mjs` | scope の構文として拒否する | 同じ |

ルートの `.github` を扱う例外は、[未リリースのソース変更（英語）](../../docs/COMPATIBILITY.md#unreleased-source-candidate-explicitly-scoped-root-github-paths)です。公開済みの 1.0.0 パッケージには入っていません。実際の `.github` の変更を隠すために別の scope を記述したり、PASS にするためだけに権限を広げたりしないでください。1.0.0 で表現できないパスが必要な場合は、既存のレビューを維持し、その制約を記録します。

## 3. 連携先を一つ選ぶ

単独のチェックと自分のタスクの確認ができたら、[連携例の一覧と設定手順（英語）](README.md#3-choose-an-entry-point)へ進みます。GitHub Actions、GitLab CI、ローカル Git hook、VS Code、Codex、Claude Code、Cursor、GitHub Copilot の例があります。既存の設定を保ちながら、必要な一つだけを追加してください。

GitHub Actions 例は、PR で提案された task を、ベースのコミットの bundle に照らしてチェックします。コアもベース側の依存からインストールし、1.0.0 であることを確認します。利用前に、レビュー済みの bundle、依存の固定、lockfile をベースブランチへ取り込んでおく必要があります。PR 側の bundle は使わないため、その変更だけでチェックの許可範囲は広がりません。ただし、bundle の変更を自動で拒否または承認するわけではありません。

workflow 自体のレビューとブランチ保護は引き続き必要です。PR イベント時点のベース SHA を使うため、ベース側の権限が後から変わった場合は再チェックします。マージ前にブランチを最新に保つ設定を使ってください。この例は PR 用であり、merge queue には別途レビューした `merge_group` 用 workflow が必要です。

Git hook、各エージェントの指示ファイル、VS Code の詳細設定は英語版にまとめています。特に、hook はステージした宣言を読み、すべての変更ファイルを検査するものではありません。指示ファイルを置くだけでは実行した証拠になりません。[VS Code のスキーマ設定（英語）](README.md#vs-code-add-input-hints-alongside-the-task)を使う場合も、bundle や task に `$schema` を追加しないでください。1.0.0 はその追加プロパティを拒否します。

## 4. 結果を読み、継続するか決める

| 終了コード | 意味 | 次の操作 |
| --- | --- | --- |
| 0 | 渡した宣言が、実施されたチェックを通った | 既存の権限、承認、レビュー、受入手順を通して進める |
| 1 | 宣言または JSON の検証で拒否された | 診断を残し、タスクや範囲・役割の判断を修正する |
| 2 | ファイル読取や CLI の問題でチェックできなかった | 入力、パス、コマンドなどを直して再実行する |

### 診断から修復する

| 表示された診断 | 修復して同じコマンドを再実行する |
| --- | --- |
| `JSON_INVALID`、終了コード 1 | 指摘された入力の JSON 構文を直す |
| `SCHEMA_REQUIRED`、`task/objective`、終了コード 1 | 求める結果を表す、空でない `objective` を戻す |
| `SCHEMA_ADDITIONALPROPERTIES`、`task/$schema`、終了コード 1 | task 内の `$schema` を削除し、エディター側のスキーマ関連付けを使う |
| `TASK_TYPE_UNROUTED`、`task/type`、終了コード 1 | 意図した既存の経路を選ぶ。同梱例は `code-change`。新しい経路には bundle のレビューが必要 |
| `TASK_WRITE_SCOPE_INVALID`、`task/inputs/scope`、終了コード 1 | 利用中のバージョンで扱える、実際の作業に即した相対パスを使う。上の scope 表を確認する |
| `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`、`task/inputs/scope`、終了コード 1 | 誤記した scope を修正する。実際に広い範囲が必要なら、既存の権限承認へ戻す |
| `CLI_ERROR`、終了コード 2 | `message` を読み、コマンド・オプション、対象パス、読取権限、作業ディレクトリを直す。固定した公開版 1.0.0 では `--format text` を指定しても stderr に 1 行の JSON で出る。source main では `--format text` のとき `CLI_ERROR: <message>` のテキストで出る |
| `ARC staged declaration check: Stage one resolved regular file for …`、終了コード 2 | 競合を解消し、レビュー済みの `.arc/bundle.json` と `.arc/task.json` をステージする。作業ファイルだけの変更では入力は変わらない |

役割や引継ぎの不整合は、既存の[失敗例（英語）](../../docs/FAILURE-CASES.md)も参照してください。相談するときは、実行したコマンド、コアのバージョン、終了コード、機密情報を除いた診断を残します。

### 試用の範囲、維持、撤去

最初の試用では、タスク一つ、連携先一つ、試す時間の上限を決めます。時間内に準備が終わらなければ、止まった箇所を記録してください。ソースのコミット、固定したコアのバージョン、lockfile、追加したファイルや設定を記録し、既存のスクリプト、hook、エディター設定、CI を残します。試用のために Git のグローバル設定を変える必要はありません。

継続する場合は、実際の変更ごとに task を更新します。権限の変更は既存の信頼できる手順でレビューし、キットや連携設定の更新後には再チェックしてください。コアの更新には、バージョンと lockfile の明示的なレビュー、および対応するチェックが必要です。1.0.0 固定の補助スクリプトは、後のリリースとの互換性を確認するものではありません。

やめる場合は、自分が追加した ARC の job、script、hook の呼出し、指示のブロック、エディターの task やスキーマ関連付けだけを外します。ほかの設定や hook の動作は残してください。ARC 専用のファイルも、ほかから使われていないと確認してから削除します。依存は、ほかに利用箇所がない場合のみパッケージマネージャーで外し、lockfile を更新します。リポジトリ全体のリセットや再帰的な削除は不要です。

実際の有用性は、既存の[実務評価キット（英語）](../external-evaluation/README.md)を使い、異なる二つの実タスクで確かめます。準備・維持・再確認の手間、見つかった矛盾、既存の仕組みとの重複を記録してください。ローカルのテンプレート確認は、エージェントの実行、本番導入、時間短縮の証拠にはなりません。

最初の試行は、`NOT_RUN` や `BLOCKED` も含めて[短い報告フォーム（英語）](https://github.com/suirindo/agent-role-contracts/issues/new?template=adoption-start.yml)から共有できます。実タスクの結果には[実務評価フォーム（英語）](https://github.com/suirindo/agent-role-contracts/issues/new?template=workflow-feedback.yml)を使ってください。セットアップ確認や最初の報告で、二つの実タスクによる評価を代替することはできません。

## source checkout からキットのテストを実行する

`tests/` 配下のテストは、リポジトリのソースではなく、consumer に固定インストールした**公開版 1.0.0** を使います。clone 直後にはそのインストールがないため、リポジトリのルートで CI の `published-consumer` job と同じ次のコマンドを一度実行してから、テストを実行してください。

```sh
npm ci --prefix experiments/adoption/consumer --ignore-scripts --include=dev --no-audit --no-fund
node --test experiments/adoption/tests/*.test.mjs
```

インストールがない間は、各テストはこの案内を理由として表示してスキップします（失敗にはなりません）。リポジトリの `npm run check` にこのテストは含まれません。このインストールは consumer の lockfile だけを読み、リポジトリのソースや、1 節で複製した `arc-check` には影響しません。

## 詳細資料と確認範囲

各連携の一次資料と詳細な確認範囲は、[英語版の出典一覧](README.md#sources-and-verification-boundary)にまとめています。この日本語版は導入と最初のタスクを扱い、各製品の詳細設定は英語版へ案内しています。

自動チェックが通っても、選んだテンプレートが自分の CI、エディター、エージェントのセッションで動いたことまでは示しません。利用する連携先で、実際に呼び出されることを確かめてください。

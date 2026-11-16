# 単体テストは両方PASS、片方は宣言外のファイルを変更

[English](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/failure-lab/01-green-tests-out-of-scope-file.md)

この文書は英語版の要約です。出力全文と詳しい説明は英語版が正本です。

2つのパッチはどちらも同じ単体テストにPASSします。片方は、タスクに宣言済みの書込み権限の外にある`config/release.json`も変更しています。ARC（Agent Role Contracts）は、変更パスの一覧を渡されると、そのパスを報告します。書込みは止めません。この例でファイルは実際に変更されます。

cloneを1回、コマンドを1つで再現できます。AIのアカウント、APIキー、エージェントの実行は不要です。2つのパッチは、エージェントの出力の代わりに使う合成のフィクスチャです。

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
git -C agent-role-contracts checkout --detach b42a308d5be59132310cfb782ed828745d7fd3bf
node agent-role-contracts/experiments/git-diff-demo/run.mjs
```

前提条件はGit 2.32以上とNode.js 22.5以上です。`npm install`は不要で、ネットワークを使うのはcloneのときだけです。

| ケース | 単体テスト | ARC（変更パス別） |
| --- | --- | --- |
| A：`src/greet.mjs`のみ | PASS | PASS |
| B：A＋`config/release.json` | PASS | `config/release.json`：FAIL (exit 1) |

このパスについて、ARCは`TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`を報告します。

## ARCがここでしないこと

- Gitの履歴やファイルの内容は読みません。変更パスを列挙してARCに渡すのはデモです。列挙されなかったパスは検査されません。
- 書込みを止めません。ケースBでは、宣言外のファイルが実際に変更され、テストはPASSしました。
- 誰が、または何が変更したのかを認証しません。
- レビュアーが実装者から独立していることを示しません。
- コードが正しいこと、安全であることを示しません。PASSは、1つのパスと1つの宣言についての結果です。

## 結果の読み方

デモは、期待した2つの結果を両方再現できたときに終了コード**0**で終わります。出力にある`FAIL (exit 1)`は、1つのパスに対するARCの結果です。デモ自身の終了コードとは別です。

単体テストが見るのは、関数がテストの期待どおりの値を返すかどうかです。2つのパッチは`src/greet.mjs`に同じ変更を加えるので、どちらもPASSします。`config/release.json`を読むテストはないため、追加の変更は結果に影響しません。

宣言検査が見るのは、変更パスがタスクに宣言済みの書込み権限に収まるかどうかです。コードが動くかどうかとは別の問いです。どちらか一方でもう一方を置き換えることはできません。テストは引き続き実行してください。

## 所要時間

計測は1回です。2026-11-17に、macOS 26.6.2、Git 2.51.2、Node.js 24.22.1で、上の3つのコマンドがcloneを含めて1.2秒で終わりました。GitやNode.jsの導入と、出力を読む時間は含みません。回線によって変わります。この計測はLinuxとWindowsでは行っていません。

このラボを開いたIssueには、メンテナーが別の1台で再実行した記録があります。これは内部での再現であり、第三者による検証ではありません。

## 失敗例を1つ追加する

[ARC Failure Lab #1](https://github.com/suirindo/agent-role-contracts/issues/134)では、公開できる合成の再現例を1つ受け付けています。次の5点を書いてください。

1. 境界：エージェントに許可されていたこと。
2. 逸脱：余分な操作、古い承認記録、欠けた項目、ポリシーとの不一致のうち、正確に1つ。
3. 再現：最小のコード、設定、手順、バージョン。オフラインで実行できる形が望ましい。
4. 期待と観測：可能なら出力と終了コードをそのまま。実行していないものには`NOT_RUN`と書く。
5. ARCで検査できることと、独立したホストやゲートが必要なこと。

ARCで検知できない例も対象です。レビューやフィクスチャとしての採用は保証されません。

本番の認証情報、秘密情報、非公開のログ、機密ファイル、個人を特定できる情報は投稿しないでください。脆弱性の疑いは、公開コメントではなく[非公開の報告](https://github.com/suirindo/agent-role-contracts/security/advisories/new)を使ってください。

自分のリポジトリで使う手順は、[デモの説明](https://github.com/suirindo/agent-role-contracts/blob/b42a308d5be59132310cfb782ed828745d7fd3bf/experiments/git-diff-demo/README.ja.md)にあります。

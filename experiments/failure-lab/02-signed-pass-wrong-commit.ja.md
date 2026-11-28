# 別のコミットに署名済みのPASS

[English](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/failure-lab/02-signed-pass-wrong-commit.md)

この文書は英語版の要約です。出力全文と詳しい説明は英語版が正本です。

レビュアーがコミットAに署名付きのPASS受領書を出します。その後ブランチはコミットBに進みますが、古い受領書は残っています。署名だけを確かめるホスト側のマージゲートは、この受領書を受け入れてしまいます。この例では、ゲートが受領書について下す5つの判定を再現します。

これはホストのゲートの実験です。ARC（Agent Role Contracts）は実行しません。ARCは署名付きレビュー受領書を実装していません。有効な署名は、独立したレビューでも、マージの許可でもありません。最初の記事はDEVで公開しました。[ARC Failure Lab #2: A signed PASS for the wrong commit](https://dev.to/netsujo/arc-failure-lab-2-a-signed-pass-for-the-wrong-commit-23lg)

```sh
git clone https://github.com/suirindo/agent-role-contracts.git
node agent-role-contracts/experiments/failure-lab/02-signed-pass-wrong-commit/review-receipt-fixture.mjs
```

前提条件はNode.js 22以上です。ほかに導入するものはなく、clone後にネットワークは使いません。フィクスチャのファイルは、DEVの記事のコードブロックとバイト単位で同一です。

| ケース | 判定 | 結果 |
| --- | --- | --- |
| 一致する受領書 | 証拠のみ | PASS |
| 新しいコミット | 古い候補 | PASS |
| ポリシー変更 | 古いポリシー | PASS |
| 別の署名者 | 信頼できない署名者 | PASS |
| 受領書なし | 保留 | PASS |

各行は、ゲートが期待どおりの判定を返したという検証の結果です。判定名は`EVIDENCE_MATCHED_ONLY`、`DENY_STALE_CANDIDATE`、`DENY_STALE_POLICY`、`DENY_UNTRUSTED_SIGNER`、`PENDING_MISSING_RECEIPT`です。成功条件を「証拠のみ」と呼ぶのは意図的です。有効な受領書は、ひとつの対象についての証拠にすぎません。

## この例が示さないこと

- ARCは実行していません。ARCについては何も確かめていません。
- レビュアーと実装者の鍵は、同じローカルプロセスが作ります。2者が独立していることは示しません。
- 署名の検証は、レビューが行われたこと、秘密鍵を誰が持っていたか、鍵の登録や失効が正しかったかを示しません。
- 署名対象のバイト形式は、このフィクスチャのためだけに固定しています。実際のプロトコルには、定められた正規のエンコードが必要です。
- 1つの受領書の同時利用や、操作後の応答の欠落は試していません。これらには、永続的な識別と照合が必要です。

## 実行結果

出力全文は英語版にあります。5行すべてが`PASS`で、最後の行は`5/5 fixture assertions passed`です。記録した実行は2回です。公開時の実行は2026-11-17、Node.js v22.16.0でした。リポジトリのコピーは2026-11-28に、macOS（arm64）、Node.js v24.11.1で再実行し、同じ5行と終了コード0を確認しました。リポジトリのファイルとDEV記事のコードブロックは`diff`で比べ、同一でした。LinuxとWindowsでは実行していません。

## 実際のマージゲートがさらに見るもの

1. 対象：受領書が、正確な候補リビジョンを対象にしている。
2. 権限：レビュアーと鍵が、このタスクで承認されていて、今も有効である。
3. 範囲：必要なレビューとCIの義務がすべて満たされている。欠けた証拠は欠けたままにする。
4. 鮮度：新しいコミットやポリシーの変更は、古いPASSを引き継がず、再検証になる。
5. 受入：保護されたマージと、本番の確認は、それぞれ別のゲートである。

DEVの記事には「重要な制御は、受領書の中に書いた作成者名ではない」とあります。このフィクスチャにそのようなフィールドはありません。制御にあたるのは、固定したレビュアーの公開鍵です。

## 関連

- [Iliya Oblakov氏の偽ACCEPTの記事](https://dev.to/iliyaoblakov/i-forged-a-codex-accept-with-four-lines-of-text-and-my-merge-check-passed-it-4odk)は、この記事への議論の出発点です。続く2件の事例は、第3回でクレジットしています。
- 古い承認の宣言レベルの対応は、このリポジトリの`npm run demo:binding --silent`です。操作は実行せず、レビュアーや承認者の認証もしません。
- 第3回は、PASSを作るチェックを誰が管理するかを扱います。[日本語の要約](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/failure-lab/03-candidate-controls-own-check.ja.md)

## 失敗例を1つ追加する

[ARC Failure Lab #1](https://github.com/suirindo/agent-role-contracts/issues/134)では、公開できる合成の再現例を1つ受け付けています。ARCやホストのゲートで検知できない例も対象です。本番の認証情報、非公開のログ、機密ファイルは投稿しないでください。脆弱性の疑いは、公開コメントではなく[非公開の報告](https://github.com/suirindo/agent-role-contracts/security/advisories/new)を使ってください。

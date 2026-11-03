# 開発組織で繰り返し起きている問題の整理と対処

[English summary](RECURRING-PROBLEMS.md)

対象: Netsujo / suirindo の開発組織で、このリポジトリの Issue（主に
[#37](https://github.com/suirindo/agent-role-contracts/issues/37)、
[#47](https://github.com/suirindo/agent-role-contracts/issues/47)、
[#53](https://github.com/suirindo/agent-role-contracts/issues/53)、
[#69](https://github.com/suirindo/agent-role-contracts/issues/69)、
[#71](https://github.com/suirindo/agent-role-contracts/issues/71)、
[#96](https://github.com/suirindo/agent-role-contracts/issues/96)）と、2026-11-02 の source checkout の実測から、
**二度以上起きている**問題を集めたものです。各行に「証拠」「既にある対処」「このリポジトリで新たに入れた対処」「残っていること」を
分けて書きます。数値（件数・時間・費用）は Issue の記載を日付付きで引くだけで、ここで集計し直しません。

読み方: この文書は作業の正本ではありません。採用数や二つ目の実タスクの有無などの計数は #47 が正本です。ここに書いた対処は
source の変更であり、npm 公開・本番導入・runtime 権限を意味しません。

## A. 進め方・組織の問題

| # | 問題 | 繰り返しの証拠 | 既にある対処 | 今回入れた対処 / 残り |
| --- | --- | --- | --- | --- |
| A1 | **独立QC が容量・admission 待ちで止まる**（容量 busy 応答、適格な runtime なし、host 負荷 preflight での拒否、model at capacity） | #47 の 2026-10-24〜10-27 の checkpoint に 7 回以上（例: [10-24](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6379321592)、[10-27](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6420822654)） | 第二ホスト（Air）の included-plan レーン、朝の再試行モニタ、「独立レビュー gate を迂回しない」規則 | 残り: 容量は組織のインフラ選択。待ち時間に中断したエージェントの**状態が残らない**問題は A4 の停止ゲートで吸収 |
| A2 | **有料QC経路の予算拒否・不確定試行・Owner 承認ループ**（PR #79 で 5 回の checkpoint。予算上限超過での事前拒否、結果の返らない有料試行、再試行の Owner 承認待ち） | [10-26](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6420389178)、[10-27](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6433404705) | 上限 A/B の Owner 判断。根本原因は **レビュー入力の肥大**（188 KB の diff、import されない vendored blob 23 中 9 本） | [CONTRIBUTING](../CONTRIBUTING.md#review-input-hygiene) に「実験は `src/` をコピーしない、manifest で pin する、レビュー入力は import される file だけ」を規則化 |
| A3 | **レビュー結果が出たのに読めない**（結果 path が許可ディレクトリ外、`Path not allowed`） | [10-27](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6420778349) に 2 回 | なし | 残り: レビューツール側の出力先を repo 内または許可済み export に固定する運用判断 |
| A4 | **エージェントが途中で中断・切替・勝手に終了する**（Owner 優先度変更での PAUSE、権限層が `git push` を拒否、launcher 起動拒否で「Owner が自分で実行」、ChatGPT/Codex が「未完了」と言って終える） | [10-24](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6379321592)、[10-26](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6409109925)、[10-27](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6430620027)、設計質問 #96 | `scripts/owner-commit-package.sh`、各 checkpoint 末尾の「Owner operation: none」 | **[停止ゲート](../experiments/stop-gate/README.ja.md)**: 受入条件を一件ずつ原文で `completed`/`unresolved` に写した handoff を通さないと停止できない。pre-commit/CI に入り、製品に依存しない。切替時に何を再検証するかは [AGENT-SWITCH-REVALIDATION](AGENT-SWITCH-REVALIDATION.md)（`tests/agent-switch-revalidation.test.mjs` で固定） |
| A5 | **並行 writer / lease / main 前進による再QC**（他 PR が main を進めると exact-head QC をやり直し、GitHub 405 protection） | [10-26](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6412109719)、[10-27](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6433311338) | Control Plane の lease、「rebind QC」 | 残り: 再QC の費用は A2 と同根。小さい PR と import される file だけのレビュー入力で緩和 |
| A6 | **checkpoint が互いを上書き、1 コメントを数日編集**（`CURRENT —` 節が複数、`UNSENT → DELIVERED → Do not repost`） | #47 本文に `CURRENT` が 2 節、[10-26 作成のコメント](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6420778349)は 10-27 まで約 25 節追記 | HTML マーカー `<!-- ARC47_… -->` | 残り: 計数と gate を一箇所の表にして PR で更新し、コメントはそこへリンクする（本文書 C 節が雛形。計数の正本は #47 のまま） |
| A7 | **主張の訂正・証拠ラベルの混同**（維持者側: 決済 field 対応の過大説明、AI 開示未記載。外部側: `exit 0` を「不正な宣言が通った」と誤読、false refusal 1→0 の訂正、同じ checklist の再投稿） | #37 [10-26](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6420107215) → [訂正](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6420484658)、[10-30](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6524213785) | 証拠クラス語彙（SELF_REPORTED / MAINTAINER_REPRODUCED / NOT_RUN） | 評価キット README に「[結果の読み方](../experiments/external-evaluation/README.md#how-to-read-a-result)」、[証拠テンプレート](../experiments/external-evaluation/EVIDENCE_TEMPLATE.md)と [feedback フォーム](../.github/ISSUE_TEMPLATE/workflow-feedback.yml)に「再掲か新規か」「実装者とレビュワーは同一人か」「証拠クラス」を追加 |
| A8 | **コピペ由来の hash 不一致**（JSON を貼ると空白・key 順が変わり SHA が合わない、backtick で SHA が消える） | #37 [10-26](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6420656948) 前後 | 原本ファイルの提出依頼 | 証拠テンプレートに `original_file_sha256` と「JSON は貼らずファイルで添付」を追加 |
| A9 | **文書ドリフト**（npm 1.0.0 の README は immutable で候補版の文言が残る、プロフィール README、検索スナップショット） | #53（2026-10-11 → 10-21 の経過）、[#47 10-19](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6270053104) | packed-README guard（PR #55）、PR #62/#64/#80 | 残り: #53 は次回の承認済みリリースで閉じる。それまで「npm 側 README は遅れている」と案内し続ける |
| A10 | **環境依存のテスト失敗**（Windows の path/Git fixture、Apple Git の出力上限、`ssh-keygen` のない container で 22 件 ENOENT、孤児を遅れて回収する init でプロセスグループ確認が 1.5 秒を超えて flaky） | [10-26](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6412109719)、2026-11-02 の本 checkout（Node 22.23.4、Linux container）で `npm run check` 失敗 23〜25 件 | 4 環境の必須 CI、run ごとの skip 数の明記 | `ssh-keygen` 不在は**理由付き skip**、Linux では zombie を「動けない＝消えた」と判定（`experiments/dispatch-test-host/process-group.mjs`、回帰テスト付き）。[CONTRIBUTING](../CONTRIBUTING.md#running-the-checks-outside-ci) に「skip は失敗ではなく、失敗は環境ノイズではない」を明記 |
| A11 | **ネットワーク・権限のブロッカー**（browser proxy 不達、`ERR_BLOCKED_BY_ADMINISTRATOR`、GitHub App の外部 repo 書込 403、DEV 取得不可、評価者側の DNS 失敗） | #47 本文 `setup-failures.json`、[10-27](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6420778349)、#37 [11-01](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6554031233) | `setup-failures.json` に記録、connector / Owner CLI への fallback | 残り: ブロッカーは環境ごとに異なる。記録様式は既にあるので、停止ゲートの `unresolved` に `UNKNOWN`/`BLOCKED` として残す運用に統一 |
| A12 | **Draft PR では hosted CI が SKIPPED になり、受入状態が曖昧** | #47 の複数 checkpoint（例: [10-22](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6363699060)） | 各 checkpoint で「SKIPPED は PASS ではない」と明記 | CONTRIBUTING のチェックリストに「exact-HEAD CI の URL（Draft は SKIPPED であり PASS ではない）」「独立QC receipt の URL」「skip 数」を追加 |
| A13 | **merged / published / listed / adopted の混同**を毎回言い直す | #47 のほぼ全コメント末尾の計数ブロック | 計数ブロック自体 | 残り: A6 と同じ。一箇所の表に集約 |
| A14 | **アウトリーチ量に対して完了した外部評価がゼロ** | [10-26](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6414952257)（DEV 招待 11、完了 0）、[10-27](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6420778349) | 「重複リマインドをしない」、#37 の一行回答形式 | 残り: 2026-11-13 の判断（C 節） |

## B. 製品・技術の問題

| # | 問題 | 繰り返しの証拠 | 既にある対処 | 今回入れた対処 / 残り |
| --- | --- | --- | --- | --- |
| B1 | **scope 文法で表せない実パス**（`.github/...`、Next.js の `(ja)`、`[slug]`、空白、非 ASCII） | #47 本文（PR #64 の再現で `WRITE_SCOPE_SYNTAX`）、[10-26 SITE #699](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6413561408) | PR #68（source main で root `.github` のみ許可。npm 1.0.0 には無い）、PR #78 の literal-path 実験 | [COMPATIBILITY「表せない path の形」](COMPATIBILITY.md#path-shapes-the-stable-grammar-cannot-express)の表と、それを固定する `tests/scope-grammar-boundary.test.mjs`。対処は「bundle を広げず `UNSUPPORTED_REQUIRED_SCOPE` と記録」 |
| B2 | **exact-file scope の保守負荷**（新 file ごとに bundle 編集） | #37 [10-26](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6420107215) | PR #80（subtree `/**` の案内） | 残り: subtree か exact かは利用側の判断。README に既記載 |
| B3 | **役割対応付け・初期設定のコスト、schema との摩擦**（`SCHEMA_TYPE`: action parameters は scalar、approval role は `routes[].accountable`、reviewer 0 人で `SCHEMA_MINITEMS`） | #47 [10-05](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6012087644)、#37 [10-26](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6421011396)、本文 `setup-failures.json` | PR #80 README 冒頭の対応付け説明 | 評価キット README に「[よくある初期設定エラー](../experiments/external-evaluation/README.md#common-setup-errors)」 |
| B4 | **既存制御との重複、増分の発見なし** | #47 本文、[10-27](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6436165185)（natural incremental contradictions 0）、[#85 の KEEP/STOP](https://github.com/suirindo/agent-role-contracts/issues/85) | 「任意の宣言 preflight」へ範囲を絞る決定、feature/adapter 拡大の保留 | 残り: 2026-11-13 の判断材料 |
| B5 | **宣言のみという境界の誤読**（runtime で止まると思われる、`exit 0` の意味、決済 tuple の変異を「ARC が拒否した」と記述） | #37 [10-26](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6420484658)、[10-28](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6467604934) | README の exit status 節、各返信での境界再掲 | 評価キット README「結果の読み方」（A7 と同じ追記） |
| B6 | **証拠ラベル**（SELF_REPORTED と維持者再現と独立検証の区別） | A7 と同じ | 証拠テンプレート | A7 と同じ追記 |
| B7 | **二つ目の実タスクでの再利用が外部で未実証** | #47 の計数 `EXTERNAL_SECOND_TASK_REUSE=UNPROVEN`（複数回） | 二タスク事前宣言の protocol | 残り: 外部評価者の行動に依存。テンプレートに「2 つ目のタスクは目的・出力・受入が別か」を追加 |
| B8 | **許可 file 内の意味的ドリフトは不可視**（同一 file 内の無関係な編集、テスト無効化が宣言上 PASS） | [10-24](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6379321592)（PR #70）、[10-27](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6436165185) | 実験 intent-boundaries / review-evidence。core は意図的に変更なし | 残り: 設計上の境界。停止ゲートの `evidence` が file/command を指すことを要求し、レビュワーが開ける材料だけは確保 |
| B9 | **実験 collector の境界バグ**（UNKNOWN と INCONSISTENT の混同、Git 出力上限） | [10-26](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6409109925)、[10-26](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6412109719) | PR #72/#73 で修正 | 完了 |
| B10 | **receipt の整合 ≠ 真正性**（finance profile に操作 ID・照合の意味はない） | #37 [11-01](https://github.com/suirindo/agent-role-contracts/issues/37#issuecomment-6553976216) | PR #101 の fixture が境界を文書化 | 完了（境界の明記） |
| B11 | **フィードバック導線の摩擦**（GitHub ログイン必須） | [10-26](https://github.com/suirindo/agent-role-contracts/issues/47#issuecomment-6408133592) | #37 の一行形式、DEV での募集 | 残り: 匿名経路を増やすかは運用判断 |

## C. 期日・判断ゲート（Issue の記載を転記）

- **2026-10-23 Stage A**: feature の変更を止め、v1.0.0 を固定。PR #62/#63/#64 の merge で満たしたと #47 に記載。
- **2026-11-03 readiness**: 問題インタビュー 5 件、独立した hands-on 評価 2 件、実ワークフロー候補 1 件。#47 本文は「活動目標であり traction の達成ではない」と明記。
- **2026-11-13 製品判断**: continue selectively / narrow scope / pause adapter expansion。「サンプルが不足していても期日を動かさない」と #47 に記載。
- **Track C**（挙動忠実性の研究）: 期日なし。Controller の STOP に gate される。
- **開いている研究 Issue**: #69（cross-tool effect integrity）、#71（permission drift）、#75（ShipRules 比較）、#96（agent switch）。#53 は次回リリースまで OPEN。

## D. この変更で入れたもの（一覧）

| 入れたもの | 場所 | 対応する行 |
| --- | --- | --- |
| `ssh-keygen` 不在の理由付き skip、Linux の zombie を「消えた」と判定、回帰テスト、README の前提条件 | `tests/dispatch-test-host-cross-host.test.mjs`、`experiments/dispatch-test-host/process-group.mjs`、`experiments/dispatch-test-host/README.md` | A10 |
| 停止ゲート（ライブラリ・CLI・デモ・EN/JA README・AGENTS 指示例・handoff テンプレート・テスト） | `experiments/stop-gate/`、`tests/stop-gate.test.mjs` | A4、A1、A11、B8 |
| エージェント切替時の再検証一覧とそれを固定するテスト | `docs/AGENT-SWITCH-REVALIDATION.md`、`tests/agent-switch-revalidation.test.mjs` | A4、#96 |
| 表せない path の形の表と固定テスト | `docs/COMPATIBILITY.md`、`tests/scope-grammar-boundary.test.mjs` | B1 |
| 評価キット「結果の読み方」「よくある初期設定エラー」、証拠テンプレートの追加項目、feedback フォームの証拠クラス | `experiments/external-evaluation/README.md`、`EVIDENCE_TEMPLATE.md`、`.github/ISSUE_TEMPLATE/workflow-feedback.yml` | A7、A8、B3、B5、B6、B7 |
| CONTRIBUTING: レビュー入力の衛生、CI 外での check の読み方、PR チェックリスト追加 | `CONTRIBUTING.md` | A2、A5、A10、A12 |

これらは source の変更です。npm 公開・runtime 権限・本番導入・採用数の変化を意味しません。安定版 core・公開 schema・CLI・exports は変えていません。

## E. 人の判断が必要なまま残っていること

1. QC 容量と有料経路（A1、A2）: どの runtime を何件まで同時に使うかの組織判断。
2. 計数と gate の一箇所化（A6、A13）: 置き場所と更新責任者。
3. 2026-11-13 の製品判断（A14、B4、B7）。
4. #53 を閉じる次回リリース（A9）。
5. レビュー結果の出力先（A3）。

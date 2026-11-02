# 停止ゲート: 検査可能な handoff なしにタスクを終えさせない（source-only 実験）

[English](README.md)

状態: **実験・source-only**。npm の `files` 一覧の外にあり、安定版 core・公開 schema 12 本・CLI・package exports は変更しません。
Node.js 22.5 以上があればどのホストでも動き、特定のエージェント製品に依存しません。

## 対象にする問題

コーディングエージェントは製品を問わず、タスクを自分の判断で終えます。繰り返し起きる形は二つです。

- **あいまいな停止**: 「完了できませんでした」や使用量上限・タイムアウトによる中断。何をやり、何が未了で、何が不明で、
  次に誰が何をするかが機械で読める形で残らない。
- **水増しした完了**: 「完了しました」。しかし受入条件の一つも、レビュワーが開ける・再実行できる何かに結び付いていない。

どちらも次の人（または次のエージェント）が状態を掘り起こし直すことになります。ARC には停止の瞬間を表す宣言、
[handoff](../../schemas/handoff.schema.json) が既にあり、公開 API の `validateHandoff` は「未解決項目を抱えた `complete`」
「未解決項目のない `blocked`」「経路外の宛先」「自分自身への handoff」を既に拒否します。停止ゲートはそこに、**既存フィールドの
使い方の約束**を一つ足し、handoff がタスクの受入条件について黙っていられないようにします。

## エージェントが従う規則

エージェントは、停止ゲートを通る handoff を書いたときだけタスクを止めてよい。

| フィールド | 約束 | 拒否コード |
| --- | --- | --- |
| `completed` / `unresolved` | タスクの `acceptance_criteria` の各項目を **原文のまま** どちらか一方の配列へ写す。他の項目を足してもよい。 | `STOP_CRITERION_UNACCOUNTED`, `STOP_CRITERION_CONFLICT` |
| `current_status: complete` | 全受入条件が `completed` にあり、`unresolved` が空（core の規則）で、`file` か `command` を持つ `evidence` が 1 件以上。 | `STOP_COMPLETE_WITH_UNMET_CRITERION`, `HANDOFF_COMPLETE_UNRESOLVED`, `STOP_EVIDENCE_UNANCHORED` |
| `current_status: ready_for_review` | 全受入条件が `completed` にあり、evidence が file/command を伴い、executor → reviewer（core の規則）。 | `STOP_REVIEW_WITH_UNMET_CRITERION`, `STOP_EVIDENCE_UNANCHORED`, `HANDOFF_REVIEW_ROUTE` |
| `current_status: in_progress` / `blocked` | `unresolved` が 1 件以上（結果不明は `UNKNOWN ...` の項目として書き、消さない）。 | `STOP_IN_PROGRESS_WITHOUT_UNRESOLVED`, `HANDOFF_BLOCKER_MISSING` |
| `required_next_action` | `complete` 以外では具体的な行動。`none` `TBD` `n/a` `continue` `なし` `未定` や記号だけの文字列は placeholder。 | `STOP_NEXT_ACTION_PLACEHOLDER` |
| `suggested_next_agent` | 経路に宣言された参加者で、委譲または報告関係が宣言されていること（core の規則）。 | `HANDOFF_ROLE_OUTSIDE_ROUTE`, `HANDOFF_RELATION_UNDECLARED`, `HANDOFF_SELF` |

判定は `ACCEPT_COMPLETE`、`ACCEPT_HANDOFF`（状態を記録した上で作業は続く）、`REJECT` の三つです。core の指摘とゲートの指摘は
`source` 付きで一緒に出るので、一回の再実行で全ての理由が見えます。ゲートを通った handoff は、安定版 CLI にとっても
普通の `0.1` handoff のままです。

## 実行する

```sh
node experiments/stop-gate/demo.mjs
node experiments/stop-gate/cli.mjs --bundle examples/team.json --task examples/task.json --handoff .arc/handoff.json --format text
```

デモは、記録されたレビュー handoff を受理し、あいまいな一方的停止と水増しした完了を拒否し、修復した `blocked` の停止を受理して、
`Demo complete: ACCEPT -> REJECT (expected) -> REJECT (expected) -> ACCEPT.` と終了コード 0 で終わります。

CLI の終了コードは安定版 CLI と同じで、`0` 受理、`1` 拒否、`2` 引数・入力エラー（stderr に `STOP_GATE_ERROR: <CODE>`）です。
入力は 1 MiB 以下の通常ファイルで、最終パス要素の symlink は拒否します。この checkout 内では `src/core.mjs` を使い、
別のリポジトリへコピーした場合は `@netsujo/agent-role-contracts/core`（または `--core` で指定したモジュール）を読み込みます。
使った core の `version` はレポートに出ます。

## 誰かが思い出さなくても効くように組み込む

1. **エージェントへの指示**（Codex の `AGENTS.md`、Claude の `CLAUDE.md`、ChatGPT のプロジェクト指示やカスタム指示、他のハーネス）:
   [AGENTS.md.example](AGENTS.md.example) の「停止の規則」を貼ります。「ゲートを通る handoff なしの停止は許される終わり方ではない」
   こと、完了できないときに何を書くかを伝えます。
2. **テンプレート**: 各タスクの handoff は [handoff.template.json](handoff.template.json) から始めます。placeholder のままでは
   ゲートを通りません。
3. **pre-commit**: `.arc/handoff.json` が staged のときにゲートを走らせます。あいまいな停止をコミットしようとしたエージェントは
   コミットの時点で止まります。

   ```sh
   if git diff --cached --name-only | grep -qx '.arc/handoff.json'; then
     node experiments/stop-gate/cli.mjs --bundle .arc/bundle.json --task .arc/task.json --handoff .arc/handoff.json --format text || exit 1
   fi
   ```

4. **CI**: 同じコマンドを、既存テストの後のステップとして利用側 workflow に足します（trusted-base の checkout 方法は導入キットの
   [github-actions.yml](../adoption/integrations/github-actions.yml) を参照）。`complete` と書かれた handoff を含む PR は、ゲートが
   拒否する限り merge できません。`blocked` の handoff は、不明点が記録されている場合だけ merge できます。
5. **再開**: 次のエージェント（製品は問わない）は handoff を読み、現在の bundle と task で `explain` と `handoff` を再実行し、
   `UNKNOWN ...` の項目を全て未解決として扱います。その瞬間に何を再検証するかは
   [docs/AGENT-SWITCH-REVALIDATION.md](../../docs/AGENT-SWITCH-REVALIDATION.md) にまとめています。

## ゲートがしないこと

JSON テキストを読むだけです。エージェントの実行や観測、テストの再実行、evidence に書かれたファイルやコマンドの実行、handoff を
書いた主体の認証、次のエージェントへの通知、結果不明の操作を再試行してよいかの判断は行いません。全てのレポートで
`work_verified` `tests_rerun` `evidence_opened` `author_authenticated` `next_agent_notified` `execution_authorized`
`runtime_enforcement` `identity_verified` `evidence_verified` は `false` です。`ACCEPT` は「停止が矛盾なく記録された」以上を
意味しません。原文一致を要求するのは意図的で、言い換えた受入条件は `unaccounted` になるため、エージェントが「完了」の意味を
こっそり狭めることができません。

回帰テスト: `tests/stop-gate.test.mjs`（ライブラリ・CLI・デモ・package 境界）。

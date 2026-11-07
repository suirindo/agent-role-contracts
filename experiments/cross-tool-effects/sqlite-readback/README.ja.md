# SQLiteで試す書き込み直前の照合と結果の読み戻し

[English](README.md)

合成データを入れた一時SQLiteデータベースで、書き込み直前の対象・版の照合と、応答が途切れた後の読み戻しを比べます。Pythonの標準ライブラリだけを使い、ARCのモジュールは呼び出しません。

## 実行

リポジトリのルートから実行します。

```sh
python3 experiments/cross-tool-effects/sqlite-readback/reproduce.py
```

Windowsでは `python3` を `py -3` に置き換えます。成功時は終了コード0で、6件の結果に続いて `6/6 matched; network=0; resend=0` を表示します。不一致時は終了コード1で、実際の全結果を `unexpected results: …` として標準エラーに出します。作業ツリーに出力ファイルは作りません。[results.tsv](results.tsv) で成功時の全出力を確認できます。

## 試験ケース

| ケースID | 変えた条件 | アプリ側の判定 |
| --- | --- | --- |
| `allowed` | 許可された対象と版 | `APPLIED` |
| `declaration_only` | 保護対象に差し替え、照合を無効化 | `APPLIED` |
| `changed_target` | 同じ差し替えで照合を有効化 | `AUTHORITY_MISMATCH` |
| `stale_revision` | 許可された対象に古い版を指定 | `AUTHORITY_MISMATCH` |
| `response_lost` | コミット後に応答を喪失、読み戻し可能 | `READBACK_CONFIRMED` |
| `reader_unavailable` | コミット後に応答を喪失、読み戻しを省略 | `HOLD_UNKNOWN` |

## 出力の読み方

各ケースはタブ区切りの5項目です。最初の2項目はケースIDとアプリ側の判定です。残りは下書きの値、保護対象の値、永続化された操作件数です。テスト側は全ケースで、別の読み取り専用接続からこの3項目を確認します。末尾の1行は6件の集計です。

## 条件を比べる

`declaration_only` と `changed_target` は同じ対象差し替えです。照合なしでは保護対象が書き換わります。照合ありでは値が `before` のまま、永続化された操作は0件です。

`response_lost` と `reader_unavailable` はどちらも、テスト側からコミット済みの操作1件を確認できます。アプリ側は読み戻せると操作を確認し、読み戻しを省略したケースでは `HOLD_UNKNOWN` に留まります。

## 試験の範囲

アプリ側とテスト側は同じプロセスと読み取り関数を使います。アプリ側の確認対象は操作IDと対象です。照会不能のケースではフラグでアプリ側の読み戻しを省略します。ネットワーク通信や再送の経路は実装しておらず、集計行の `network=0` と `resend=0` は固定値です。判定コードと版の比較はこの試験専用です。重複操作の分岐、実サービス、資格情報の分離、OS隔離、障害後の復旧は試験範囲外です。

## ARCとの関係

この試験はnpm配布物とARCの通常チェック・CIの範囲外です。ARCのコア、スキーマ、API、パッケージの版に変更はありません。[別のループバック実験](../lab/README.md) では、別プロセスの受信機を使って応答喪失、HTTP 404、再送時の挙動を扱います。

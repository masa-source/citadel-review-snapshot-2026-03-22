# テンプレート（Excel）

このディレクトリにはレポート用 Excel テンプレート（.xlsx）を配置します。

## レポート・対象計器の customData（スキーマ駆動）

メタデータ駆動移行後、レポート直下の拡張データは **customData** で参照します。スキーマ定義（SchemaDefinition）の jsonSchema に応じたキーを使用してください。

- **レポート**: `{{ customData.year }}`, `{{ customData.inspectionType }}` 等（デモでは year, inspectionType を利用）
- **対象計器（1件目）**: `{{ targetInstrumentPrimary.customData.<キー> }}`
- キーはスキーマ定義で定義したプロパティ名。存在しないキーは `| default('')` でフォールバック可。

## 作業者・取引先・対象機器のキー参照

インデックス（1件目・2件目）ではなく、**論理キー**で参照すると、並び替え後も同じセルに同じ値が入ります。

| 種別                       | 推奨プレースホルダ                                           | 備考                                                                                                   |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 作業者（役割）             | `{{ reportWorkersByRole.leader.worker.name }}`               | 役割: `reportWorkersByRole.leader.workerRole`。主担当=leader, 副担当=assistant 等                      |
| 取引先（役割）             | `{{ reportClientsByRole.owner.company.name }}`               | 役割キーで一意（owner, contractor 等）                                                                 |
| 対象機器（タグ番号）       | `{{ targetInstrumentsByTagNumber.TAG_001.range }}`           | 同一レポート内でタグ番号が一意のとき。                                                                 |
| 使用部品（カテゴリ）       | `{{ usedPartsByCategory.seal }}`                             | Part.category でグループ化。配列なのでループで利用。未設定は `_`                                       |
| 所有計器（種別）           | `{{ reportOwnedInstrumentsByType.standard_pressure_gauge }}` | OwnedInstrument.instrumentType でグループ化                                                            |
| 対象計器の表（役割キー）   | `{{ targetInstrumentPrimary.tablesOrdered[1].roleKey }}`     | 表1件目。役割で参照: `{{ targetInstrumentPrimary.tablesByRole.測定結果.roleKey }}`                     |
| 対象計器の表の行（ループ） | `{{ targetInstrumentPrimary.tablesOrdered[1].rows }}`        | Jinja で `{% for row in targetInstrumentPrimary.tablesOrdered[1].rows %}` と併用。行の列は表定義に依存 |

## AI によるテンプレート自動生成（Beta）

Admin のテンプレート一覧から「AIにおまかせ生成（Beta）」で、既存の .xlsx をアップロードすると、AI（LM Studio 等）が報告書データを抽出し、プレースホルダを自動配置したうえでこのディレクトリにテンプレートとして登録する。

- **サンプルファイル**: `sample_complex_report.xlsx` はこの機能の動作確認用。手動 E2E 手順は [docs/DEVELOPER.md](../../../../docs/DEVELOPER.md) の「AI テンプレート自動生成の手動 E2E 確認」を参照。
- **前提**: バックエンドの環境変数（`AI_API_BASE_URL` / `AI_MODEL_NAME`）で LM Studio 等の OpenAI 互換 API を指していること。

## 再生成

テンプレートを再生成する場合:

```bash
cd apps/backend
python scripts/gen_templates.py
```

生成されるファイル: `Report_Demo_1.xlsx`, `Base.xlsx`

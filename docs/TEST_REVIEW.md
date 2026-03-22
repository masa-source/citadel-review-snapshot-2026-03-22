# テスト構成とマーカー

バックエンド・フロントエンドのテスト構成と、pytest の正常系/異常系マーカーについてまとめます。

---

## 1. バックエンド単体テスト（Unit）

| 対象                            | テストファイル                  | 備考                                                                       |
| ------------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| **utils/date_utils.py**         | `tests/unit/test_date_utils.py` | `parse_iso_to_utc_naive` の UTC/JST/naive を網羅                           |
| **utils/quarantine.py**         | `tests/unit/test_quarantine.py` | 拡張子・サイズ・一括検疫。資産は `Report_Demo_1.xlsx` / `Base.xlsx` を参照 |
| **services/db_loader.py**       | `tests/unit/test_db_loader.py`  | `load_report_context` の clientIds 変換等を検証                            |
| **services/template_editor.py** | 単体テストなし                  | 統合テストでカバー。必要に応じて `load_grid` / `save_grid` の単体を追加可  |

その他: test_auth, test_binder, test_demo_data, test_error_reporting, test_exporter, test_importer, test_template_dir など、対象モジュールと整合。

---

## 2. バックエンド統合テスト（Integration）

- **test_reports_api.py**: レポート・コンテキスト API。必須キーは `load_report_context` の戻り値に合わせてある。Pydantic V2 化以降、`model_dump()` による出力や動的ファクトリ (`create_input_schema`) に由来するモデルの振る舞いもここで包括的に確認される。
- **test_template_editor_robustness.py**: 設計台の数式・日付・結合セル・GET grid の row_metadata/col_metadata。Windows では一時ファイルで PermissionError が出ることがある（CI の Linux では通常問題なし）。
- **test_reports_api.py** のテンプレート CRUD: GET/DELETE/PUT の 404、GET/POST の正常系。
- test_api_health, test_api_key_auth, test_lock_api, test_sync_api など: 対象 API と整合。

---

## 3. フロントエンドテスト

- **Admin**: `src/utils/api.test.ts` で `apiClient` (openapi-fetch) を利用した `fetcher` / `getApiBaseUrl` / `downloadPdf` / `downloadExcelZip` 等の通信ユーティリティを検証。
- **Scout**: `src/utils/dbExport.test.ts`, `src/utils/reportNavigation.test.ts` で対象ユーティリティをカバー。

実行: ルートで `pnpm -F @citadel/scout exec vitest run` / `pnpm -F @citadel/admin exec vitest run`（watch なし）。

---

バックエンドの pytest では、**正常系（normal）** と **異常系（error）** をマーカーで区別しています。

> [!IMPORTANT]
> **厳格なマーカー運用**: `pytest.ini` で `--strict-markers` が有効になっています。定義されていないマーカーを付与するとテスト実行時にエラー（タイポ防止）となります。新しいカテゴリが必要な場合は `pytest.ini` に追記してください。

| マーカー | 意味                                                       |
| -------- | ---------------------------------------------------------- |
| `normal` | 正常系（期待する入力で 2xx または成功挙動を検証）          |
| `error`  | 異常系（4xx/5xx、バリデーションエラー、NotFound 等を検証） |

### 実行と CI での可視化

- 全テスト: `python -m pytest tests/ -v`
- 正常系のみ: `python -m pytest tests/ -m normal -v`
- 異常系のみ: `python -m pytest tests/ -m error -v`

**CI (GitHub Actions) 上の分離**:
トラブルシューティングを迅速化するため、バックエンドテストは CI 上で以下の 3 ステップに分かれて実行されます。

1. `Normal cases` (正常系)
2. `Error cases` (異常系)
3. `Unmarked cases` (マーカー漏れ確認用)

これにより、ロジックの破壊（Normal 失敗）か、バリデーション仕様の変更（Error 失敗）かを GUI 上で即座に判別できます。

### その他の CI 連携

- **並列実行**: `pytest-xdist` (-n auto) により、バックエンドテストは CPU コア数に応じて並列実行され、高速化されています。
- **PR カバレッジ**: プルリクエスト時には、バックエンドのカバレッジ結果が自動的にコメントとして投稿されます。
- **E2E レポート**: Playwright のテスト結果は GitHub Pages に自動公開されます。Artifact をダウンロードせずにブラウザでトレースやスクリーンショットを確認可能です。

---

## 5. 推奨事項（任意）

- **template_editor**: `load_grid` / `save_grid` の単体テストを追加すると、結合セル拒否や値の正規化の回帰防止に有効。
- **Admin 設計台**: 設計台ページ用のコンポーネント/フックのテストを追加すると変更時の安全性が上がる。
- **設計台の 409**: テンプレートの mtime 不一致・シート名不一致時の 409 を明示的にテストすると回帰防止に有効。

---

**実行時の注意**: バックエンドテストは必ず **venv を有効化した環境**で実行すること（`pnpm test:backend` はプロジェクトの venv を参照）。実環境に pip インストールしないこと。

"""template_auto_placer のサービステスト。

generate_auto_placeholders(grid_data, context_data) が、
load_grid 形式の grid_data と ReportContext 由来の context_data から
置換リスト [{"sheetName", "row", "col", "value"}, ...] を正しく生成することを検証する。
"""

from services.template_auto_placer import generate_auto_placeholders


class TestGenerateAutoPlaceholders:
    """generate_auto_placeholders のテスト"""

    def test_returns_empty_list_when_context_is_none(self) -> None:
        """context_data が None のとき空リストを返す。"""
        grid_data = {
            "sheets": [{"name": "Sheet1", "data": [["点検報告書"]], "mergeCells": []}]
        }
        result = generate_auto_placeholders(grid_data, None)
        assert result == []

    def test_returns_empty_list_when_context_is_empty(self) -> None:
        """context_data が空のとき空リストを返す。"""
        grid_data = {
            "sheets": [{"name": "Sheet1", "data": [["点検報告書"]], "mergeCells": []}]
        }
        result = generate_auto_placeholders(grid_data, {})
        assert result == []

    def test_single_match_returns_one_placeholder(self) -> None:
        """グリッドの値がコンテキストの reportTitle と一致するとき、1件の置換候補を返す。"""
        grid_data = {
            "sheets": [
                {
                    "name": "Sheet1",
                    "data": [["点検報告書"]],
                    "mergeCells": [],
                }
            ]
        }
        context_data = {"reportTitle": "点検報告書"}
        result = generate_auto_placeholders(grid_data, context_data)

        assert len(result) == 1
        assert result[0]["sheetName"] == "Sheet1"
        assert result[0]["row"] == 0
        assert result[0]["col"] == 0
        assert result[0]["value"] == "{{ reportTitle }}"

    def test_excluded_values_are_not_matched(self) -> None:
        """除外値（「なし」「－」「○」など）はマッチさせない。"""
        grid_data = {
            "sheets": [
                {
                    "name": "Sheet1",
                    "data": [["なし", "－", "○", "点検報告書"]],
                    "mergeCells": [],
                }
            ]
        }
        context_data = {"reportTitle": "点検報告書"}
        result = generate_auto_placeholders(grid_data, context_data)

        assert len(result) == 1
        assert result[0]["value"] == "{{ reportTitle }}"
        assert result[0]["col"] == 3

    def test_merged_cell_non_top_left_excluded(self) -> None:
        """結合セルの左上以外のセルはマッチ対象に含めない。"""
        # 0,0 と 1,0 が結合 → (1,0) は covered
        grid_data = {
            "sheets": [
                {
                    "name": "Sheet1",
                    "data": [
                        ["点検報告書"],
                        ["点検報告書"],  # 同じ値だが結合の一部
                    ],
                    "mergeCells": [{"row": 0, "col": 0, "rowspan": 2, "colspan": 1}],
                }
            ]
        }
        context_data = {"reportTitle": "点検報告書"}
        result = generate_auto_placeholders(grid_data, context_data)

        # 左上 (0,0) のみマッチし、(1,0) は結合のため1件のみ
        assert len(result) == 1
        assert result[0]["row"] == 0
        assert result[0]["col"] == 0

    def test_multiple_sheets_each_with_sheet_name(self) -> None:
        """複数シートがあるとき、各マッチに sheetName が正しく付与される。"""
        grid_data = {
            "sheets": [
                {
                    "name": "表紙",
                    "data": [["点検報告書"]],
                    "mergeCells": [],
                },
                {
                    "name": "本文",
                    "data": [["点検報告書", "テスト株式会社"]],
                    "mergeCells": [],
                },
            ]
        }
        context_data = {
            "reportTitle": "点検報告書",
            "company": {"name": "テスト株式会社"},
        }
        result = generate_auto_placeholders(grid_data, context_data)

        by_sheet: dict[str, list[dict]] = {}
        for item in result:
            by_sheet.setdefault(item["sheetName"], []).append(item)

        assert "表紙" in by_sheet
        assert "本文" in by_sheet
        assert len(by_sheet["表紙"]) == 1
        assert by_sheet["表紙"][0]["value"] == "{{ reportTitle }}"
        # 本文: reportTitle と company.name の2箇所
        assert len(by_sheet["本文"]) == 2
        values = {it["value"] for it in by_sheet["本文"]}
        assert "{{ reportTitle }}" in values
        assert "{{ company.name }}" in values

    def test_already_placeholder_cell_excluded(self) -> None:
        """既に {{ ... }} のセルはマッチ対象に含めない。"""
        grid_data = {
            "sheets": [
                {
                    "name": "Sheet1",
                    "data": [["{{ reportTitle }}", "点検報告書"]],
                    "mergeCells": [],
                }
            ]
        }
        context_data = {"reportTitle": "点検報告書"}
        result = generate_auto_placeholders(grid_data, context_data)

        assert len(result) == 1
        assert result[0]["col"] == 1
        assert result[0]["value"] == "{{ reportTitle }}"

    def test_empty_sheets_returns_empty(self) -> None:
        """sheets が空のとき空リストを返す。"""
        result = generate_auto_placeholders({"sheets": []}, {"reportTitle": "x"})
        assert result == []

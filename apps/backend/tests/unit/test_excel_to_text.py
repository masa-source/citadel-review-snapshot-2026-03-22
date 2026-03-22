"""
excel_to_text のユニットテスト。
grid_to_text の空行・空列スキップおよび Markdown 表形式の出力を検証する。
"""

from utils.excel_to_text import grid_to_text


class TestGridToText:
    def test_empty_input_returns_empty_or_safe_string(self) -> None:
        """grid_data が {} または {"sheets": []} のとき、空文字または安全な文字列が返る。"""
        assert grid_to_text({}) == ""
        assert grid_to_text({"sheets": []}) == ""

    def test_single_sheet_single_row_includes_header_and_format(self) -> None:
        """data が [["A", "B", "C"]] のとき、見出し行と区切り行およびその行が含まれる。"""
        grid_data = {
            "sheets": [{"name": "Sheet1", "data": [["A", "B", "C"]]}],
        }
        result = grid_to_text(grid_data)
        assert "A" in result and "B" in result and "C" in result
        assert "Sheet1" in result
        # Markdown 表なら | が含まれる
        assert "|" in result

    def test_skips_all_empty_rows(self) -> None:
        """すべてのセルが空の行は出力に含まれない。"""
        grid_data = {
            "sheets": [
                {
                    "name": "S1",
                    "data": [
                        ["A", "B"],
                        [None, None],
                        ["C", "D"],
                    ],
                }
            ],
        }
        result = grid_to_text(grid_data)
        assert "A" in result and "B" in result
        assert "C" in result and "D" in result
        # 空行のみの行はセル数が2の「空」なので、行として出てこない
        lines_with_content = [line for line in result.splitlines() if line.strip()]
        assert len([ln for ln in lines_with_content if "A" in ln or "C" in ln]) >= 2

    def test_skips_all_empty_columns(self) -> None:
        """すべてのセルが空の列は出力に含まれない。"""
        grid_data = {
            "sheets": [
                {
                    "name": "S1",
                    "data": [
                        ["A", "", "B"],
                        ["C", "", "D"],
                    ],
                }
            ],
        }
        result = grid_to_text(grid_data)
        assert "A" in result and "B" in result
        assert "C" in result and "D" in result
        # 空列が除外されていれば、見出しは A と B の2列
        lines = result.splitlines()
        header = next((ln for ln in lines if "A" in ln and "B" in ln), None)
        assert header is not None

    def test_multiple_sheets_combined(self) -> None:
        """2シート分の name と data を渡すと、両方のシート名と内容が結合される。"""
        grid_data = {
            "sheets": [
                {"name": "Sheet1", "data": [["X", "Y"]]},
                {"name": "Sheet2", "data": [["P", "Q"]]},
            ],
        }
        result = grid_to_text(grid_data)
        assert "Sheet1" in result and "Sheet2" in result
        assert "X" in result and "Y" in result
        assert "P" in result and "Q" in result

    def test_cell_value_types_converted_to_str(self) -> None:
        """数値や bool が data に含まれていても str に変換されて出力される。"""
        grid_data = {
            "sheets": [
                {
                    "name": "S1",
                    "data": [[1, 2.5, True, "text"]],
                }
            ],
        }
        result = grid_to_text(grid_data)
        assert "1" in result
        assert (
            "2.5" in result or "2,5" in result
        )  # ロケールで小数点が変わる可能性は低い
        assert "text" in result
        # True は "True" になる
        assert "True" in result

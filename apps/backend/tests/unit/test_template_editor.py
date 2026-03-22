"""
template_editor.py のユニットテスト
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from services.template_editor import load_grid, save_grid


class TestSaveGridEdgeCases:
    """save_grid の不正座標で ValueError、load_workbook の BadZipFile を検証。"""

    def test_save_grid_invalid_coord_negative_raises_value_error(
        self, tmp_path: Path
    ) -> None:
        """負の座標で ValueError が発生する。"""
        xlsx = tmp_path / "book.xlsx"
        xlsx.write_bytes(b"dummy")
        with patch("services.template_editor.load_workbook") as mock_load:
            mock_wb = MagicMock()
            mock_wb.sheetnames = ["Sheet1"]
            mock_wb.__enter__ = MagicMock(return_value=mock_wb)
            mock_wb.__exit__ = MagicMock(return_value=False)
            mock_ws = MagicMock()
            mock_ws.merged_cells = None
            mock_wb.__getitem__ = MagicMock(return_value=mock_ws)
            mock_load.return_value = mock_wb

            with pytest.raises(ValueError, match="行番号が範囲外|無効な座標"):
                save_grid(
                    xlsx,
                    [{"sheetName": "Sheet1", "row": -1, "col": 0, "value": "x"}],
                )

    def test_save_grid_row_out_of_range_raises_value_error(
        self, tmp_path: Path
    ) -> None:
        """行番号が Excel の制限超えで ValueError。"""
        xlsx = tmp_path / "book.xlsx"
        xlsx.write_bytes(b"dummy")
        with patch("services.template_editor.load_workbook") as mock_load:
            mock_wb = MagicMock()
            mock_wb.sheetnames = ["Sheet1"]
            mock_ws = MagicMock()
            mock_ws.merged_cells = None
            mock_wb.__getitem__ = MagicMock(return_value=mock_ws)
            mock_load.return_value = mock_wb

            with pytest.raises(ValueError, match="行番号が範囲外"):
                save_grid(
                    xlsx,
                    [
                        {
                            "sheetName": "Sheet1",
                            "row": 1048576,
                            "col": 0,
                            "value": "x",
                        }
                    ],
                )

    def test_load_workbook_bad_zip_propagates(self, tmp_path: Path) -> None:
        """load_workbook が BadZipFile を投げた際は呼び出し元に伝播する。"""
        from zipfile import BadZipFile

        bad_file = tmp_path / "not.xlsx"
        bad_file.write_text("not a zip", encoding="utf-8")
        with patch(
            "services.template_editor.load_workbook",
            side_effect=BadZipFile("bad"),
        ):
            with pytest.raises(BadZipFile):
                load_grid(bad_file)

    def test_save_grid_merged_cell_rejection(self, tmp_path: Path) -> None:
        """結合セルの左上以外への書き込みは ValueError で拒絶される。"""
        xlsx = tmp_path / "book.xlsx"
        xlsx.write_bytes(b"dummy")
        with patch("services.template_editor.load_workbook") as mock_load:
            mock_wb = MagicMock()
            mock_wb.sheetnames = ["Sheet1"]
            mock_ws = MagicMock()
            # (2, 2) を含む結合範囲をシミュレート
            # _build_merged_covered_cells_per_sheet は (min_row, min_col) 以外を covered に入れる
            mock_rng = MagicMock()
            mock_rng.min_row = 1
            mock_rng.max_row = 2
            mock_rng.min_col = 1
            mock_rng.max_col = 2
            mock_ws.merged_cells.ranges = [mock_rng]
            mock_wb.__getitem__ = MagicMock(return_value=mock_ws)
            mock_load.return_value = mock_wb

            with pytest.raises(ValueError, match="結合セルの一部のため書き込めません"):
                save_grid(
                    xlsx,
                    [
                        {"sheetName": "Sheet1", "row": 1, "col": 1, "value": "check"}
                    ],  # (2, 2) is 1-based
                )

    def test_save_grid_formula_cleared(self, tmp_path: Path) -> None:
        """数式セルへの書き込み時、データ型が 's' に変更され数式がクリアされる。"""
        xlsx = tmp_path / "book.xlsx"
        xlsx.write_bytes(b"dummy")
        with patch("services.template_editor.load_workbook") as mock_load:
            mock_wb = MagicMock()
            mock_wb.sheetnames = ["Sheet1"]
            mock_ws = MagicMock()
            mock_cell = MagicMock()
            mock_cell.data_type = "f"  # 数式
            mock_ws.cell.return_value = mock_cell
            mock_ws.merged_cells.ranges = []
            mock_wb.__getitem__ = MagicMock(return_value=mock_ws)
            mock_load.return_value = mock_wb

            save_grid(
                xlsx,
                [{"sheetName": "Sheet1", "row": 0, "col": 0, "value": "new value"}],
            )

            assert mock_cell.value == "new value"
            assert mock_cell.data_type == "s"

    def test_save_grid_invalid_sheet_name_skips(self, tmp_path: Path) -> None:
        """存在しないシート名への書き込み指定は無視され、クラッシュしない。"""
        xlsx = tmp_path / "book.xlsx"
        xlsx.write_bytes(b"dummy")
        with patch("services.template_editor.load_workbook") as mock_load:
            mock_wb = MagicMock()
            mock_wb.sheetnames = ["Sheet1"]
            mock_load.return_value = mock_wb

            # クラッシュせずに完了することを確認
            save_grid(
                xlsx,
                [{"sheetName": "NonExistent", "row": 0, "col": 0, "value": "x"}],
            )
            mock_wb.save.assert_called_once()

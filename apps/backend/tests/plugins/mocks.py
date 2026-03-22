import shutil
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# =============================================================================
# xlwings Mock Fixture
# =============================================================================


@pytest.fixture(scope="session")
def worker_tmp_dir(worker_id: str) -> Path:
    """ワーカーごとに独立した一時ディレクトリを提供。"""
    tmp_path = Path(f"temp_test_{worker_id}")
    # 既存の残骸を削除して新規作成
    if tmp_path.exists():
        shutil.rmtree(tmp_path, ignore_errors=True)
    tmp_path.mkdir(parents=True, exist_ok=True)
    yield tmp_path
    # クリーンアップ
    if tmp_path.exists():
        shutil.rmtree(tmp_path, ignore_errors=True)


class DummyCell:
    """テストアサーション用の単純な値コンテナ"""

    def __init__(self, value: Any):
        self.value = value


class DummyRange:
    """シートの used_range を模倣するコンテナ"""

    def __init__(self, rows: list[list[DummyCell]]):
        self.rows = rows

    def __iter__(self):
        return iter([cell for row in self.rows for cell in row])


def setup_xlwings_mock(mock_xw: MagicMock) -> MagicMock:
    """xlwings の MagicMock に対して、必要な副作用や初期データ（ダミーセル等）をセットアップする。"""
    created_books = []

    def default_create_file_side_effect(*args, **kwargs):
        target = kwargs.get("Filename") or kwargs.get("PrToFileName")
        if target:
            p = Path(str(target).replace("\\", "/"))
            p.parent.mkdir(parents=True, exist_ok=True)
            if p.suffix.lower() == ".pdf":
                minimal_pdf = (
                    b"%PDF-1.1\n"
                    b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
                    b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
                    b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >> endobj\n"
                    b"xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000062 00000 n\n0000000117 00000 n\n"
                    b"trailer << /Size 4 /Root 1 0 R >>\n"
                    b"startxref\n190\n%%EOF"
                )
                p.write_bytes(minimal_pdf)
            else:
                p.touch()

    def _open_book(path):
        book = MagicMock()
        book.path = path

        sheet = MagicMock()
        cells = [
            [DummyCell("{{ reportTitle }}"), DummyCell("{{ company.name }}")],
            [DummyCell("固定値"), DummyCell(123)],
        ]
        sheet.used_range = DummyRange(cells)
        book.sheets = [sheet]

        book.api.ExportAsFixedFormat.side_effect = default_create_file_side_effect
        book.api.PrintOut.side_effect = default_create_file_side_effect

        def save(save_path=None):
            if save_path:
                Path(save_path).parent.mkdir(parents=True, exist_ok=True)
                Path(save_path).touch()

        book.save.side_effect = save

        created_books.append(book)
        return book

    mock_app = MagicMock()
    mock_app.books.open.side_effect = _open_book
    mock_xw.App.return_value = mock_app

    # 結合テストなどで作成されたブックを後から検証できるように属性として生やしておく
    mock_xw.created_books = created_books
    return mock_xw


@pytest.fixture
def mock_xlwings() -> MagicMock:
    """
    xlwings をモック化するフィクスチャ。
    Excel がインストールされていない環境でもテスト可能にする。
    """
    mock_xw = MagicMock()
    setup_xlwings_mock(mock_xw)

    with patch.dict("sys.modules", {"xlwings": mock_xw}):
        with (
            patch("services.binder.pdf_zip.xw", mock_xw, create=True),
            patch("services.binder.excel_placeholders.xw", mock_xw, create=True),
        ):
            yield mock_xw


@pytest.fixture(autouse=False)
def auto_mock_xlwings() -> MagicMock:
    """
    xlwings を自動的にモック化するフィクスチャ（autouse=True にすると全テストに適用）。
    CI 環境では conftest.py の autouse=True を有効にすることを推奨。
    """
    mock_xw = MagicMock()
    setup_xlwings_mock(mock_xw)

    with patch.dict("sys.modules", {"xlwings": mock_xw}):
        with (
            patch("services.binder.pdf_zip.xw", mock_xw, create=True),
            patch("services.binder.excel_placeholders.xw", mock_xw, create=True),
        ):
            yield mock_xw

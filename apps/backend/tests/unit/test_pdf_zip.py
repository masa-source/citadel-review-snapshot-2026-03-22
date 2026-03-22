"""
generate_report_pdf の詳細テスト（リトライ、障害注入、プロセス強制終了）
"""

import sys
from unittest.mock import MagicMock, patch

import pytest

from services.binder.pdf_zip import _get_excel_printer_name, generate_report_pdf


@pytest.fixture
def mock_context():
    return {
        "reportTitle": "テストタイトル",
        "company": {"name": "テスト会社"},
    }


@pytest.fixture
def mock_template():
    m = MagicMock()
    m.file_path = "template.xlsx"
    m.sort_order = 1
    m.name = "TestTemplate"
    return m


@pytest.mark.unit
class TestPdfZipFaultInjection:
    """障害注入によるリトライ・クリーンアップの検証"""

    def test_retry_success(self, mock_xlwings, tmp_path, mock_context, mock_template):
        """
        2回失敗しても3回目で成功すれば正常終了することを検証
        """
        output_pdf = tmp_path / "output.pdf"
        assets_base = tmp_path / "assets"
        assets_base.mkdir()
        (assets_base / "template.xlsx").touch()

        books = []
        open_mock = mock_xlwings.App.return_value.books.open
        original_open_side_effect = open_mock.side_effect

        def side_effect_open(*args, **kwargs):
            book = original_open_side_effect(*args, **kwargs)
            books.append(book)

            # 3回目の呼び出しで成功するように side_effect を設定
            call_count = 0
            original_side_effect = book.api.ExportAsFixedFormat.side_effect

            def rolling_side_effect(*a, **kw):
                nonlocal call_count
                call_count += 1
                if call_count < 3:
                    raise Exception("COM Error Simulation")
                return original_side_effect(*a, **kw)

            book.api.ExportAsFixedFormat.side_effect = rolling_side_effect
            return book

        open_mock.side_effect = side_effect_open

        generate_report_pdf(
            templates=[mock_template],
            output_pdf_path=output_pdf,
            context=mock_context,
            assets_base=assets_base,
            use_printer=False,
        )

        assert output_pdf.exists()
        assert len(books) == 1
        # 3回呼ばれたことを確認 (2回失敗 + 1回成功)
        assert books[0].api.ExportAsFixedFormat.call_count == 3

    def test_retry_exhausted(self, mock_xlwings, tmp_path, mock_context, mock_template):
        """
        3回すべて失敗した場合に例外が伝播することを検証
        """
        output_pdf = tmp_path / "output.pdf"
        assets_base = tmp_path / "assets"
        assets_base.mkdir()
        (assets_base / "template.xlsx").touch()

        open_mock = mock_xlwings.App.return_value.books.open
        original_open_side_effect = open_mock.side_effect

        def side_effect_open(*args, **kwargs):
            book = original_open_side_effect(*args, **kwargs)
            # 常に失敗するように設定
            book.api.ExportAsFixedFormat.side_effect = Exception("Permanent COM Error")
            return book

        open_mock.side_effect = side_effect_open

        with pytest.raises(Exception, match="Permanent COM Error"):
            generate_report_pdf(
                templates=[mock_template],
                output_pdf_path=output_pdf,
                context=mock_context,
                assets_base=assets_base,
                use_printer=False,
            )

    def test_force_kill_excel_process(
        self, mock_xlwings, tmp_path, mock_context, mock_template
    ):
        """
        Excelプロセスの強制終了が psutil 経由で呼ばれることを検証
        """
        output_pdf = tmp_path / "output.pdf"
        assets_base = tmp_path / "assets"
        assets_base.mkdir()
        (assets_base / "template.xlsx").touch()

        dummy_pid = 99999

        # mock_xlwings の App() 生成時の PID プロパティを書き換える
        mock_xlwings.App.return_value.pid = dummy_pid

        with patch("psutil.Process") as mock_ps_cls:
            mock_proc = MagicMock()
            mock_proc.is_running.return_value = True
            mock_ps_cls.return_value = mock_proc

            generate_report_pdf(
                templates=[mock_template],
                output_pdf_path=output_pdf,
                context=mock_context,
                assets_base=assets_base,
                use_printer=False,
            )

            # psutil.Process(pid) が正しいPIDで呼ばれたか
            mock_ps_cls.assert_called_with(dummy_pid)
            # kill() が呼ばれたか
            mock_proc.kill.assert_called_once()

    def test_win32_printer_branch_on_linux(
        self, mock_xlwings, tmp_path, mock_context, mock_template
    ):
        """
        Linux環境でも win32 ブランチを通るようにパッチして検証
        """
        output_pdf = tmp_path / "output.pdf"
        assets_base = tmp_path / "assets"
        assets_base.mkdir()
        (assets_base / "template.xlsx").touch()

        # プラットフォームとプリンタ取得、および PDF 結合をモック化
        with (
            patch("services.binder.pdf_zip.sys.platform", "win32"),
            patch("services.binder.pdf_zip.PdfWriter") as mock_writer_cls,
        ):
            mock_writer = MagicMock()
            mock_writer_cls.return_value = mock_writer

            with patch(
                "services.binder.pdf_zip._get_excel_printer_name"
            ) as mock_get_printer:
                mock_get_printer.return_value = "Microsoft Print to PDF on Ne01:"

                # PrintOut を使うように設定
                open_mock = mock_xlwings.App.return_value.books.open
                original_open_side_effect = open_mock.side_effect

                def side_effect_open(*args, **kwargs):
                    book = original_open_side_effect(*args, **kwargs)
                    # 最初の1回失敗し、2回目は conftest.py のデフォルト挙動（ファイル作成）を行う
                    book.api.PrintOut.side_effect = [
                        Exception("Printer Error"),
                        book.api.PrintOut.side_effect,
                    ]
                    return book

                open_mock.side_effect = side_effect_open

                # use_printer=True で呼び出し
                generate_report_pdf(
                    templates=[mock_template],
                    output_pdf_path=output_pdf,
                    context=mock_context,
                    assets_base=assets_base,
                    use_printer=True,
                )

                # mock_writer.write(str(output_pdf)) が呼ばれたことを確認
                mock_writer.write.assert_called_once_with(str(output_pdf))
                # PrintOut が呼ばれたことを確認 (1回目失敗 + 2回目成功)
                # (1つ目のTemplateに対するPrintOut)
                pass

    @pytest.mark.skipif(sys.platform != "win32", reason="winreg is Windows-only")
    def test_get_excel_printer_name_registry_mock(self):
        """
        _get_excel_printer_name の内部ロジックをレジストリモックで検証
        """
        with patch("services.binder.pdf_zip.winreg") as mock_winreg:
            # レジストリ値の模擬
            mock_key = MagicMock()
            mock_winreg.OpenKey.return_value.__enter__.return_value = mock_key

            # 枚挙結果をシミュレート
            mock_winreg.EnumValue.side_effect = [
                (
                    "OneNote",
                    "Microsoft.OneNote_8wekyb3d8bbwe!microsoft.onenote,Ne00:",
                    None,
                ),
                ("Microsoft Print to PDF", "winspool,Ne01:", None),
                OSError(),  # 終了
            ]

            printer_name = _get_excel_printer_name("Microsoft Print to PDF")
            assert printer_name == "Microsoft Print to PDF on Ne01:"

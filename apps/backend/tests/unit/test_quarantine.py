"""
検疫ユーティリティ（quarantine_xlsx）の単体テスト

ブックバインダー用のテンプレート検疫ロジックを検証する。
"""

import io
import zipfile
from collections.abc import Iterable
from pathlib import Path
from unittest.mock import patch

import pytest

from utils.quarantine import (
    check_extension,
    check_file_size,
    check_password_and_structure,
    quarantine_xlsx,
)

_WORKBOOK_XML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def _make_minimal_xlsx_bytes(
    *,
    extra_files: dict[str, bytes | str] | None = None,
    encrypted_member_name: str | None = None,
) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        if not (extra_files and "xl/workbook.xml" in extra_files):
            zf.writestr(
                "xl/workbook.xml",
                (
                    f'<workbook xmlns="{_WORKBOOK_XML_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                    '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>'
                    "</workbook>"
                ),
            )
        zf.writestr("xl/worksheets/sheet1.xml", "<worksheet></worksheet>")

        if extra_files:
            for path, content in extra_files.items():
                zf.writestr(path, content)

        if encrypted_member_name:
            info = zipfile.ZipInfo(encrypted_member_name)
            info.flag_bits |= 0x1
            zf.writestr(info, b"encrypted-placeholder")

    return buf.getvalue()


def _write_xlsx(tmp_path: Path, name: str, xlsx_bytes: bytes) -> Path:
    p = tmp_path / name
    p.write_bytes(xlsx_bytes)
    return p


def _workbook_xml_with_sheets(
    *,
    sheet_count: int,
    hidden_states: Iterable[str] = (),
) -> str:
    sheets_xml: list[str] = []
    hidden_states = list(hidden_states)
    for i in range(sheet_count):
        state = hidden_states[i] if i < len(hidden_states) else None
        state_attr = f' state="{state}"' if state else ""
        sheets_xml.append(
            f'<sheet name="S{i + 1}" sheetId="{i + 1}" r:id="rId{i + 1}"{state_attr}/>'
        )
    return (
        f'<workbook xmlns="{_WORKBOOK_XML_NS}" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<sheets>{''.join(sheets_xml)}</sheets></workbook>"
    )


class TestCheckExtension:
    """拡張子チェックの検証"""

    @pytest.mark.normal
    def test_xlsx_allowed(self) -> None:
        r = check_extension("template.xlsx")
        assert r is None

    @pytest.mark.normal
    def test_xlsx_case_insensitive(self) -> None:
        r = check_extension("TEMPLATE.XLSX")
        assert r is None

    @pytest.mark.error
    def test_xlsm_rejected(self) -> None:
        r = check_extension("macro.xlsm")
        assert r is not None
        assert r.ok is False
        assert "xlsm" in r.message.lower() or "マクロ" in r.message

    @pytest.mark.error
    def test_xlsb_rejected(self) -> None:
        r = check_extension("binary.xlsb")
        assert r is not None
        assert r.ok is False

    @pytest.mark.error
    def test_other_extension_rejected(self) -> None:
        r = check_extension("doc.pdf")
        assert r is not None
        assert r.ok is False
        assert ".xlsx" in r.message

    @pytest.mark.error
    def test_empty_filename_rejected(self) -> None:
        r = check_extension("")
        assert r is not None
        assert r.ok is False


class TestCheckFileSize:
    """ファイルサイズチェックの検証"""

    @pytest.mark.normal
    def test_under_limit_ok(self) -> None:
        r = check_file_size(10 * 1024 * 1024)  # 10MB
        assert r is None

    @pytest.mark.normal
    def test_at_limit_ok(self) -> None:
        r = check_file_size(20 * 1024 * 1024)  # 20MB
        assert r is None

    @pytest.mark.error
    def test_over_limit_rejected(self) -> None:
        r = check_file_size(20 * 1024 * 1024 + 1)
        assert r is not None
        assert r.ok is False
        assert "20MB" in r.message or "大き" in r.message


class TestQuarantineXlsx:
    """quarantine_xlsx 一括検疫の検証"""

    @pytest.mark.error
    def test_extension_reject_before_scan(self) -> None:
        result = quarantine_xlsx(filename="bad.xlsm", file_size=100)
        assert result.ok is False
        assert "xlsm" in result.message.lower() or "マクロ" in result.message

    @pytest.mark.error
    def test_size_reject_before_scan(self) -> None:
        result = quarantine_xlsx(
            filename="large.xlsx",
            file_size=21 * 1024 * 1024,
        )
        assert result.ok is False
        assert "20MB" in result.message or "大き" in result.message

    @pytest.mark.normal
    def test_valid_xlsx_passes(self, tmp_path: Path) -> None:
        """正常な .xlsx（ZIP構造）が検疫を通過することを確認"""
        sample = _write_xlsx(tmp_path, "valid.xlsx", _make_minimal_xlsx_bytes())
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is True, result.message

    @pytest.mark.error
    def test_quarantine_rejects_password_protected_when_encrypted_flag_present(
        self,
        tmp_path: Path,
    ) -> None:
        sample = _write_xlsx(tmp_path, "encrypted.xlsx", _make_minimal_xlsx_bytes())
        encrypted_info = zipfile.ZipInfo("xl/worksheets/sheet1.xml")
        encrypted_info.flag_bits |= 0x1

        class _FakeZipFile:
            def __enter__(self):  # noqa: ANN001
                return self

            def __exit__(self, exc_type, exc, tb):  # noqa: ANN001
                return False

            def infolist(self):  # noqa: ANN001
                return [encrypted_info]

            def namelist(self):  # noqa: ANN001
                return ["xl/workbook.xml", "xl/worksheets/sheet1.xml"]

            def open(self, name):  # noqa: ANN001
                return io.BytesIO(b"<xml/>")

        with patch("utils.quarantine.zipfile.ZipFile", return_value=_FakeZipFile()):
            result = quarantine_xlsx(file_path=sample)
        assert result.ok is False
        assert "パスワード" in result.message

    @pytest.mark.error
    def test_quarantine_rejects_when_bad_zip(self, tmp_path: Path) -> None:
        sample = tmp_path / "broken.xlsx"
        sample.write_bytes(b"not-a-zip")
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is False
        assert "ZIP" in result.message

    @pytest.mark.error
    def test_quarantine_rejects_vba_macro(self, tmp_path: Path) -> None:
        sample = _write_xlsx(
            tmp_path,
            "macro.xlsx",
            _make_minimal_xlsx_bytes(extra_files={"xl/vbaProject.bin": b"dummy"}),
        )
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is False
        assert "マクロ" in result.message or "VBA" in result.message

    @pytest.mark.error
    @pytest.mark.parametrize(
        "path",
        [
            "xl/externalLinks/externalLink1.xml",
            "xl/connections.xml",
            "xl/connections/connection1.xml",
        ],
    )
    def test_quarantine_rejects_external_links_or_connections(
        self,
        tmp_path: Path,
        path: str,
    ) -> None:
        sample = _write_xlsx(
            tmp_path,
            "external.xlsx",
            _make_minimal_xlsx_bytes(extra_files={path: b"dummy"}),
        )
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is False
        assert "外部" in result.message or "接続" in result.message

    @pytest.mark.error
    def test_quarantine_rejects_embeddings(self, tmp_path: Path) -> None:
        sample = _write_xlsx(
            tmp_path,
            "embed.xlsx",
            _make_minimal_xlsx_bytes(
                extra_files={"xl/embeddings/oleObject1.bin": b"x"}
            ),
        )
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is False
        assert "埋め込み" in result.message

    @pytest.mark.error
    def test_quarantine_rejects_hidden_sheet(self, tmp_path: Path) -> None:
        workbook_xml = _workbook_xml_with_sheets(
            sheet_count=1, hidden_states=["hidden"]
        )
        sample = _write_xlsx(
            tmp_path,
            "hidden.xlsx",
            _make_minimal_xlsx_bytes(extra_files={"xl/workbook.xml": workbook_xml}),
        )
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is False
        assert "隠し" in result.message

    @pytest.mark.error
    @pytest.mark.parametrize("state", ["veryHidden", "VERYHIDDEN"])
    def test_quarantine_rejects_very_hidden_sheet(
        self,
        tmp_path: Path,
        state: str,
    ) -> None:
        workbook_xml = _workbook_xml_with_sheets(sheet_count=1, hidden_states=[state])
        sample = _write_xlsx(
            tmp_path,
            "veryhidden.xlsx",
            _make_minimal_xlsx_bytes(extra_files={"xl/workbook.xml": workbook_xml}),
        )
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is False
        assert "隠し" in result.message

    @pytest.mark.error
    def test_quarantine_rejects_when_sheet_count_exceeds_limit(
        self,
        tmp_path: Path,
    ) -> None:
        from utils.quarantine import MAX_SHEETS

        workbook_xml = _workbook_xml_with_sheets(sheet_count=MAX_SHEETS + 1)
        sample = _write_xlsx(
            tmp_path,
            "too_many_sheets.xlsx",
            _make_minimal_xlsx_bytes(extra_files={"xl/workbook.xml": workbook_xml}),
        )
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is False
        assert str(MAX_SHEETS) in result.message

    @pytest.mark.normal
    def test_quarantine_rejects_invalid_workbook_xml(self, tmp_path: Path) -> None:
        sample = _write_xlsx(
            tmp_path,
            "invalid_workbook.xlsx",
            _make_minimal_xlsx_bytes(
                extra_files={"xl/workbook.xml": "<workbook><sheets>"}
            ),
        )
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is False

    @pytest.mark.normal
    def test_quarantine_adds_warning_when_creator_metadata_present(
        self,
        tmp_path: Path,
    ) -> None:
        core_xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/">'
            "<dc:creator>Someone</dc:creator>"
            "</cp:coreProperties>"
        )
        sample = _write_xlsx(
            tmp_path,
            "with_core.xlsx",
            _make_minimal_xlsx_bytes(extra_files={"docprops/core.xml": core_xml}),
        )
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is True
        assert any("メタデータ" in w or "作成者" in w for w in result.warnings)

    @pytest.mark.normal
    def test_quarantine_rejects_invalid_core_xml(self, tmp_path: Path) -> None:
        sample = _write_xlsx(
            tmp_path,
            "bad_core.xlsx",
            _make_minimal_xlsx_bytes(extra_files={"docprops/core.xml": "<bad"}),
        )
        result = quarantine_xlsx(file_path=sample)
        assert result.ok is False

    @pytest.mark.error
    def test_check_password_and_structure_file_obj_restores_seek_position_on_reject(
        self,
    ) -> None:
        buf = io.BytesIO(_make_minimal_xlsx_bytes())
        buf.seek(5)
        before = buf.tell()
        encrypted_info = zipfile.ZipInfo("xl/workbook.xml")
        encrypted_info.flag_bits |= 0x1

        class _FakeZipFile:
            def __enter__(self):  # noqa: ANN001
                return self

            def __exit__(self, exc_type, exc, tb):  # noqa: ANN001
                return False

            def infolist(self):  # noqa: ANN001
                return [encrypted_info]

        with patch("utils.quarantine.zipfile.ZipFile", return_value=_FakeZipFile()):
            result = check_password_and_structure(None, buf)
        assert result is not None
        assert result.ok is False
        assert buf.tell() == before

    @pytest.mark.normal
    def test_quarantine_with_file_obj_restores_seek_position(self) -> None:
        data = _make_minimal_xlsx_bytes()
        buf = io.BytesIO(data)
        buf.seek(7)
        before = buf.tell()
        result = quarantine_xlsx(file_obj=buf, filename="ok.xlsx")
        assert result.ok is True
        assert buf.tell() == before

    @pytest.mark.error
    def test_quarantine_when_file_path_missing_returns_not_found(
        self,
        tmp_path: Path,
    ) -> None:
        missing = tmp_path / "missing.xlsx"
        result = quarantine_xlsx(file_path=missing)
        assert result.ok is False
        assert "見つかりません" in result.message

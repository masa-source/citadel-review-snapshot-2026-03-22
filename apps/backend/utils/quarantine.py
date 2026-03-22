"""
ブックバインダー用：テンプレート検疫（Quarantine）

新規テンプレート納品時に、マクロ・外部参照・埋め込み・パスワード等を検知し、
受け付け可能な .xlsx ファイルかどうかを判定する。.xlsx のみ許可し、安全でない要素は拒否する。
"""

from __future__ import annotations

import logging
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO

import defusedxml.ElementTree as ET

logger = logging.getLogger(__name__)

# ファイルサイズ上限（20MB）
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

# シート数上限（リソース保護のため）
MAX_SHEETS = 20

# 許可する拡張子（小文字）
ALLOWED_EXTENSION = ".xlsx"
REJECTED_EXTENSIONS = (".xlsm", ".xlsb")

# ZIP 内で検知すると拒否するパス（プレフィックス）
EXTERNAL_PREFIXES = ("xl/externalLinks/", "xl/connections.xml", "xl/connections/")
EMBEDDINGS_PREFIX = "xl/embeddings/"


@dataclass
class QuarantineResult:
    """検疫結果。ok が False の場合は受け付け不可。"""

    ok: bool
    message: str
    warnings: list[str] = field(default_factory=list)


def _normalize_member_name(name: str) -> str:
    """ZIP メンバー名を正規化（バックスラッシュ → スラッシュ、先頭スラッシュ除去）。"""
    return name.replace("\\", "/").lstrip("/")


def check_extension(filename: str | None) -> QuarantineResult | None:
    """
    .xlsx のみ許可し、.xlsm / .xlsb は拒否する。
    問題がなければ None を返し、拒否時は QuarantineResult を返す。
    """
    if not filename or not filename.strip():
        return QuarantineResult(
            ok=False,
            message="ファイル名がありません。このファイルはお受けできません。",
        )
    lower = filename.lower().strip()
    if lower.endswith(REJECTED_EXTENSIONS):
        return QuarantineResult(
            ok=False,
            message="このファイルには不適切なマクロが含まれています（.xlsm / .xlsb）。.xlsx 形式のみお受けします。",
        )
    if not lower.endswith(ALLOWED_EXTENSION):
        return QuarantineResult(
            ok=False,
            message="このファイルは .xlsx 形式である必要があります。",
        )
    return None


def check_file_size(size: int) -> QuarantineResult | None:
    """20MB を超えるファイルは拒否。"""
    if size > MAX_FILE_SIZE_BYTES:
        return QuarantineResult(
            ok=False,
            message="このファイルは大きすぎます（20MB を超えています）。お受けできません。",
        )
    return None


def _list_zip_members(zf: zipfile.ZipFile) -> list[str]:
    """ZIP 内のメンバー名を正規化したリストで返す。"""
    return [_normalize_member_name(info.filename) for info in zf.infolist()]


def _has_encrypted_member(zf: zipfile.ZipFile) -> bool:
    """暗号化されたメンバーが含まれているか（パスワード保護の目安）。"""
    for info in zf.infolist():
        if info.flag_bits & 0x1:  # 暗号化フラグ
            return True
    return False


def _read_member_safe(zf: zipfile.ZipFile, name: str) -> bytes | None:
    """ZIP メンバーを読み取り。暗号化等で読めない場合は None。"""
    try:
        with zf.open(name) as f:
            return f.read()
    except (RuntimeError, KeyError, zipfile.BadZipFile):
        return None


def check_password_and_structure(
    file_path: Path | None, file_obj: BinaryIO | None
) -> QuarantineResult | None:
    """
    ZIP として開けるか確認し、パスワード保護（暗号化）されていれば拒否。
    file_path と file_obj のどちらか一方を渡す。両方渡した場合は file_path を優先。
    """

    def _check_zip(zf: zipfile.ZipFile) -> QuarantineResult | None:
        if _has_encrypted_member(zf):
            return QuarantineResult(
                ok=False,
                message="このファイルはパスワードで保護されています。パスワードを解除してから納品してください。",
            )
        return None

    if file_path is not None and file_obj is None:
        try:
            with zipfile.ZipFile(file_path, "r") as zf:
                return _check_zip(zf)
        except zipfile.BadZipFile:
            return QuarantineResult(
                ok=False,
                message="有効な .xlsx ファイルではありません（ZIP として開けません）。",
            )
        except RuntimeError as e:
            if "password" in str(e).lower() or "encrypted" in str(e).lower():
                return QuarantineResult(
                    ok=False,
                    message="このファイルはパスワードで保護されています。お受けできません。",
                )
            raise
        return None

    if file_obj is not None:
        current = file_obj.tell() if hasattr(file_obj, "tell") else 0
        try:
            file_obj.seek(0)
            with zipfile.ZipFile(file_obj, "r") as zf:
                res = _check_zip(zf)
                if res is not None:
                    file_obj.seek(current)
                    return res
            file_obj.seek(current)
        except zipfile.BadZipFile:
            if hasattr(file_obj, "seek"):
                file_obj.seek(current)
            return QuarantineResult(
                ok=False,
                message="有効な .xlsx ファイルではありません（ZIP として開けません）。",
            )
        except RuntimeError as e:
            if hasattr(file_obj, "seek"):
                file_obj.seek(current)
            if "password" in str(e).lower() or "encrypted" in str(e).lower():
                return QuarantineResult(
                    ok=False,
                    message="このファイルはパスワードで保護されています。お受けできません。",
                )
            raise
        return None

    return QuarantineResult(ok=False, message="ファイルが指定されていません。")


def _scan_zip(
    zf: zipfile.ZipFile,
    names: list[str],
) -> tuple[list[str], list[str]]:
    """
    ZIP 内をスキャンし、(拒否理由のリスト, 警告のリスト) を返す。
    拒否理由が 1 つでもあれば受け付け不可。警告のみの場合は受け付け可能だが注意を促す。
    """
    reject_reasons: list[str] = []
    warnings: list[str] = []

    # マクロ検知（vbaProject.bin / vbaProject.xml）
    for n in names:
        low = n.lower()
        if "vbaproject.bin" in low or "vbaproject.xml" in low:
            reject_reasons.append(
                "このファイルには不適切なマクロ（VBA）が含まれています。お受けできません。"
            )
            break

    # 外部参照・接続
    for prefix in EXTERNAL_PREFIXES:
        if any(n.lower().startswith(prefix.lower()) for n in names):
            reject_reasons.append(
                "外部参照またはデータ接続が含まれています。削除してから納品してください。"
            )
            break

    # 埋め込みオブジェクト
    if any(n.lower().startswith(EMBEDDINGS_PREFIX.lower()) for n in names):
        reject_reasons.append(
            "埋め込みオブジェクトが含まれています。削除してから納品してください。"
        )

    # 隠しシート・シート数上限
    workbook_name = None
    for n in names:
        if n.lower().endswith("workbook.xml"):
            workbook_name = n
            break
    if workbook_name:
        # namelist の実名で開く（正規化名と逆引き）
        real_name = next(
            (fn for fn in zf.namelist() if _normalize_member_name(fn) == workbook_name),
            workbook_name,
        )
        data = _read_member_safe(zf, real_name)
        if not data:
            reject_reasons.append(
                "workbook.xml を読み取れませんでした。有効な .xlsx ファイルではない可能性があります。"
            )
        else:
            try:
                root = ET.fromstring(data)
                sheet_count = 0
                has_hidden_sheet = False
                for elem in root.iter():
                    tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
                    if tag == "sheet":
                        sheet_count += 1
                        state = elem.get("state") or elem.get(
                            "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}state"
                        )
                        if (state or "").lower() in ("hidden", "veryhidden"):
                            has_hidden_sheet = True
                if has_hidden_sheet:
                    reject_reasons.append(
                        "隠しシートが含まれています。表示してから納品してください。"
                    )
                if sheet_count > MAX_SHEETS:
                    reject_reasons.append(
                        f"このファイルは厚すぎて綴じることができません（シート数は最大{MAX_SHEETS}枚まで）。"
                    )
            except (ET.ParseError, TypeError, ValueError):
                reject_reasons.append(
                    "workbook.xml の解析に失敗しました。有効な .xlsx ファイルではない可能性があります。"
                )

    # メタデータ（作成者等）は警告のみ
    for n in names:
        if "docprops/core.xml" in n.lower():
            real_name = next(
                (fn for fn in zf.namelist() if _normalize_member_name(fn) == n), n
            )
            data = _read_member_safe(zf, real_name)
            if not data:
                reject_reasons.append(
                    "docprops/core.xml を読み取れませんでした。有効な .xlsx ファイルではない可能性があります。"
                )
            else:
                try:
                    root = ET.fromstring(data)
                    dc_ns = {"dc": "http://purl.org/dc/elements/1.1/"}
                    creator = root.find(".//dc:creator", dc_ns)
                    if creator is not None and (creator.text or "").strip():
                        warnings.append(
                            "作成者などのメタデータが含まれています。必要に応じて Excel で削除できます。"
                        )
                except (ET.ParseError, TypeError, ValueError):
                    reject_reasons.append(
                        "docprops/core.xml の解析に失敗しました。有効な .xlsx ファイルではない可能性があります。"
                    )
            break

    return reject_reasons, warnings


def quarantine_xlsx(
    file_path: Path | None = None,
    *,
    file_obj: BinaryIO | None = None,
    filename: str | None = None,
    file_size: int | None = None,
) -> QuarantineResult:
    """
    テンプレート .xlsx の検疫を一括実行する。

    Args:
        file_path: ファイルパス（ローカルパス）。file_obj より優先。
        file_obj: ファイルライクオブジェクト（read, seek）。アップロード時はこちらを渡すと良い。
        filename: 元のファイル名（拡張子チェック用）。未指定時は file_path の name を使用。
        file_size: ファイルサイズ（バイト）。未指定時は file_path または file_obj から取得を試みる。

    Returns:
        QuarantineResult。ok が True のときのみ受け付け可能。
    """
    warnings: list[str] = []

    # 1. 拡張子
    name_for_ext = filename or (file_path.name if file_path else "")
    if res := check_extension(name_for_ext):
        return res

    # 2. ファイルサイズ
    if file_size is not None:
        if res := check_file_size(file_size):
            return res
    elif file_path and file_path.exists():
        if res := check_file_size(file_path.stat().st_size):
            return res
    elif file_obj is not None and hasattr(file_obj, "seek"):
        try:
            current = file_obj.tell()
            file_obj.seek(0, 2)
            size = file_obj.tell()
            file_obj.seek(current)
            if res := check_file_size(size):
                return res
        except Exception as e:
            logger.warning("ファイルサイズ取得（seek）に失敗しました: %s", e)

    # 3. ZIP として開き、パスワード保護チェック
    if file_path is not None and not file_path.exists():
        return QuarantineResult(
            ok=False,
            message=f"ファイルが見つかりません: {file_path.name}",
        )

    if file_path and file_path.exists():
        if res := check_password_and_structure(file_path, None):
            return res
        try:
            with zipfile.ZipFile(file_path, "r") as zf:
                names = _list_zip_members(zf)
                reject, warn = _scan_zip(zf, names)
                warnings.extend(warn)
                if reject:
                    return QuarantineResult(
                        ok=False,
                        message="このファイルはお受けできません。理由: "
                        + " ".join(reject),
                        warnings=warnings,
                    )
        except zipfile.BadZipFile:
            return QuarantineResult(
                ok=False,
                message="有効な .xlsx ファイルではありません（ZIP として開けません）。",
            )
        except RuntimeError as e:
            if "password" in str(e).lower() or "encrypted" in str(e).lower():
                return QuarantineResult(
                    ok=False,
                    message="このファイルはパスワードで保護されています。お受けできません。",
                )
            raise
    elif file_obj is not None:
        try:
            current = file_obj.tell()
            file_obj.seek(0)
            if res := check_password_and_structure(None, file_obj):
                file_obj.seek(current)
                return res
            file_obj.seek(0)
            with zipfile.ZipFile(file_obj, "r") as zf:
                names = _list_zip_members(zf)
                reject, warn = _scan_zip(zf, names)
                warnings.extend(warn)
                if reject:
                    file_obj.seek(current)
                    return QuarantineResult(
                        ok=False,
                        message="このファイルはお受けできません。理由: "
                        + " ".join(reject),
                        warnings=warnings,
                    )
            file_obj.seek(current)
        except zipfile.BadZipFile:
            if hasattr(file_obj, "seek"):
                file_obj.seek(current)
            return QuarantineResult(
                ok=False,
                message="有効な .xlsx ファイルではありません（ZIP として開けません）。",
            )
        except RuntimeError as e:
            if "password" in str(e).lower() or "encrypted" in str(e).lower():
                if hasattr(file_obj, "seek"):
                    file_obj.seek(current)
                return QuarantineResult(
                    ok=False,
                    message="このファイルはパスワードで保護されています。お受けできません。",
                )
            if hasattr(file_obj, "seek"):
                file_obj.seek(current)
            raise
    else:
        return QuarantineResult(ok=False, message="ファイルが指定されていません。")

    return QuarantineResult(ok=True, message="検疫を通過しました。", warnings=warnings)

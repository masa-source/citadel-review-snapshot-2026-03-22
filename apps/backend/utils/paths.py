"""パス解決ユーティリティ。テンプレート・assets の基準ディレクトリなど。"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def get_assets_base() -> Path:
    """テンプレート file_path の基準ディレクトリ（backend/assets）。"""
    return Path(__file__).resolve().parent.parent / "assets"


def get_assets_templates_dir() -> Path:
    """
    テンプレートディレクトリを返す。
    環境変数 TEMPLATE_DIR で切り替え可能（本番用: template-local）。
    未設定時は assets/templates を使用。
    """
    base = get_assets_base()

    custom_template_dir = os.getenv("TEMPLATE_DIR")
    if custom_template_dir:
        custom_path = base / custom_template_dir
        if custom_path.is_dir():
            logger.info("Using custom template directory: %s", custom_path)
            return custom_path
        logger.warning(
            "Custom template directory not found: %s, falling back to default",
            custom_path,
        )

    return base / "templates"


def get_valid_template_paths(assets_base: Path, template_dir_name: str) -> list[str]:
    """
    テンプレートディレクトリ内の有効な .xlsx を再帰的に列挙し、
    assets_base からの相対パス（スラッシュ区切り）のリストで返す。
    ~$ で始まる一時ファイルと .tmp で終わるファイルは除外する。
    """
    templates_dir = assets_base / template_dir_name
    if not templates_dir.is_dir():
        return []
    result: list[str] = []
    for path in templates_dir.rglob("*.xlsx"):
        if not path.is_file():
            continue
        name = path.name
        if name.startswith("~$") or name.endswith(".tmp"):
            continue
        rel = path.relative_to(assets_base)
        result.append(rel.as_posix())
    return sorted(result)


def get_output_temp_dir() -> Path:
    """一時ディレクトリ（backend/output_temp）の絶対パスを返す。"""
    return Path(__file__).resolve().parent.parent / "output_temp"

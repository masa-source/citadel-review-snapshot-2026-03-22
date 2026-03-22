"""
Excel プレースホルダ置換: Jinja2 レンダリングと xlwings によるシート走査。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import xlwings as xw
from jinja2 import Environment

from .context import ReportContextLike

logger = logging.getLogger(__name__)

_JINJA_ENV = Environment(autoescape=False)  # nosec B701 (Excel rendering doesn't need HTML escaping)


def _render_cell_template(value: str, context: ReportContextLike) -> str:
    """
    セルの文字列を Jinja2 テンプレートとしてレンダリングする。
    例: '{{ company.name }}', '{{ usedPartPrimary.part.name }}'
    """
    try:
        template = _JINJA_ENV.from_string(value)
        rendered = template.render(context)
        return rendered
    except Exception:
        logger.exception("セルのテンプレートレンダリングに失敗しました: %r", value)
        return value


def _fill_sheet_placeholders(sheet: Any, context: ReportContextLike) -> None:
    """1 シート内の全セルを走査し、Jinja2 で {{ ... }} をレンダリング。"""
    used = sheet.used_range
    if used is None:
        return
    for row in used.rows:
        for cell in row:
            val = cell.value
            if not isinstance(val, str) or "{{" not in val:
                continue
            new_val = _render_cell_template(val, context)
            if new_val != val:
                cell.value = new_val


def fill_excel_placeholders(
    template_path: str | Path,
    output_path: str | Path,
    context: ReportContextLike,
) -> None:
    """
    Excel テンプレート内の {{ path }} を context の値で置換し、output_path に保存する。
    xlwings 使用（Excel がインストールされている環境で動作）。
    """
    template_path = Path(template_path)
    output_path = Path(output_path)
    if not template_path.exists():
        raise FileNotFoundError(f"テンプレートが見つかりません: {template_path}")

    app = xw.App(visible=False)
    try:
        book = app.books.open(str(template_path.resolve()))
        try:
            for sheet in book.sheets:
                _fill_sheet_placeholders(sheet, context)
            book.save(str(output_path.resolve()))
        finally:
            book.close()
    finally:
        app.quit()

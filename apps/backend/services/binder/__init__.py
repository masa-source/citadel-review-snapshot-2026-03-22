"""
データ変換 & Excel プレースホルダ置換ロジック。
Facade: 既存の import パスを維持するため公開 API とテスト用シンボルを re-export。
"""

from .context import ReportContextLike, TemplateLike
from .excel_placeholders import _render_cell_template, fill_excel_placeholders
from .pdf_zip import generate_report_excel_zip, generate_report_pdf

__all__ = [
    "ReportContextLike",
    "TemplateLike",
    "fill_excel_placeholders",
    "generate_report_excel_zip",
    "generate_report_pdf",
    "_render_cell_template",
]

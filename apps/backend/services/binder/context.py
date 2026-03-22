"""
データコンテキスト生成: Excel 用 context。
"""

from __future__ import annotations

from typing import Any, Protocol

from services.context_models import ReportContextRoot

# スナップショット（DB 由来）は dict で渡るため、context 引数は両方許容する
ReportContextLike = ReportContextRoot | dict[str, Any]


class TemplateLike(Protocol):
    """sort_order, file_path, name を持つテンプレート（ReportTemplate 等）。"""

    sort_order: int | None
    file_path: str | None
    name: str | None

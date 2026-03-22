"""テンプレート用の置換リスト自動生成サービス。

load_grid 形式の grid_data と ReportContext 由来の context_data から、
save_grid の changes 形式の置換リストを生成する。
結合セル除外は utils.placeholder_matching.run_match_scan に委譲する。
"""

from __future__ import annotations

from typing import Any

from utils.placeholder_matching import run_match_scan


def generate_auto_placeholders(
    grid_data: dict[str, Any],
    context_data: dict[str, Any] | None,
    strategy: str = "ordered",
) -> list[dict[str, Any]]:
    """グリッドとコンテキストから置換候補リストを生成する。

    Args:
        grid_data: load_grid の戻り値。{"sheets": [{"name", "data", "mergeCells"}, ...]}。
        context_data: ReportContext を model_dump(by_alias=True) した辞書。None または空のときは [] を返す。
        strategy: マッチ戦略。"ordered" / "key" / "primary"。

    Returns:
        save_grid の changes 形式のリスト。
        [{"sheetName": str, "row": int, "col": int, "value": str}, ...]
        value は "{{ path }}" 形式のプレースホルダ文字列。
    """
    if context_data is None or not context_data:
        return []

    sheets = grid_data.get("sheets") or []
    result: list[dict[str, Any]] = []

    for sheet in sheets:
        name = sheet.get("name")
        if not name:
            continue
        data = sheet.get("data") or []
        merge_cells = sheet.get("mergeCells") or []

        matches = run_match_scan(
            context_data=context_data,
            grid_data=data,
            merge_cells=merge_cells,
            strategy=strategy,
        )
        for m in matches:
            result.append(
                {
                    "sheetName": name,
                    "row": m.row,
                    "col": m.col,
                    "value": m.placeholder,
                }
            )

    return result

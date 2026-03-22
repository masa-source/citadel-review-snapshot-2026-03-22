"""
load_grid で取得したグリッドデータをテキスト化する。
AI の入力用に、空行・空列を除外し Markdown 表形式で結合する。
"""

from __future__ import annotations


def _is_empty_cell(value: object) -> bool:
    """セルが空か（None / 空文字 / 空白のみ）。"""
    if value is None:
        return True
    s = str(value).strip()
    return s == ""


def _trim_empty_rows_and_columns(data: list[list[object]]) -> list[list[object]]:
    """すべてのセルが空の行・列を除外する。"""
    if not data:
        return []
    # 空でない行のみ残す
    non_empty_rows = [row for row in data if not all(_is_empty_cell(c) for c in row)]
    if not non_empty_rows:
        return []
    max_cols = max(len(row) for row in non_empty_rows)
    # 列インデックスごとに「その列がすべて空か」を判定
    non_empty_col_indices = [
        ci
        for ci in range(max_cols)
        if not all(
            _is_empty_cell(row[ci]) if ci < len(row) else True for row in non_empty_rows
        )
    ]
    return [
        [row[ci] for ci in non_empty_col_indices if ci < len(row)]
        for row in non_empty_rows
    ]


def _row_to_markdown_cells(row: list[object]) -> list[str]:
    """1行のセル値を Markdown 表のセル文字列に変換（パイプ・改行はエスケープしない簡易）。"""
    return [str(c).strip() if c is not None else "" for c in row]


def _sheet_to_markdown_table(name: str, data: list[list[object]]) -> str:
    """1シート分の data を Markdown 表にし、シート名見出しと合わせて返す。"""
    trimmed = _trim_empty_rows_and_columns(data)
    if not trimmed:
        return f"## {name}\n\n(空)\n"
    lines = [f"## {name}", ""]
    for i, row in enumerate(trimmed):
        cells = _row_to_markdown_cells(row)
        line = "| " + " | ".join(cells) + " |"
        lines.append(line)
        if i == 0:
            lines.append("| " + " | ".join("---" for _ in cells) + " |")
    lines.append("")
    return "\n".join(lines)


def grid_to_text(grid_data: dict) -> str:
    """
    load_grid の戻り値形式の dict を受け取り、全シートを Markdown 表形式で結合した文字列を返す。
    空行・空列は除外してトークンを節約する。
    """
    sheets = grid_data.get("sheets") if isinstance(grid_data, dict) else None
    if not sheets:
        return ""
    parts = []
    for sheet in sheets:
        if not isinstance(sheet, dict):
            continue
        name = sheet.get("name", "Sheet")
        data = sheet.get("data")
        if not isinstance(data, list):
            continue
        parts.append(_sheet_to_markdown_table(name, data))
    return "\n".join(parts)

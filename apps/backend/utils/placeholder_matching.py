"""Placeholder matching utilities ported from frontend TypeScript implementation.

This module provides pure functions for:
- flattening nested context objects into ``{path, value}`` pairs
- building a value -> path map with stable path preference
- classifying paths (ordered / key / primary)
- excluding unsuitable cell values from automatic matching
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Literal

# --- Hidden keys and basic helpers -----------------------------------------------------

HIDDEN_KEYS: set[str] = {
    "id",
    "createdAt",
    "updatedAt",
    "sortOrder",
    "isLocal",
    "reportSnapshot",
}


def is_hidden_key(key: str) -> bool:
    """Return True if key should be excluded from traversal."""

    return key in HIDDEN_KEYS or key.endswith("Id")


# Keys treated as ordered lists where index starts from 1
ORDERED_LIST_KEYS: set[str] = {
    "reportClientsOrdered",
    "reportWorkersOrdered",
    "targetInstrumentsOrdered",
    "reportOwnedInstrumentsOrdered",
    "usedPartsOrdered",
}

# Nested ordered lists (e.g. tables)
NESTED_ORDERED_LIST_KEYS: set[str] = {
    "tablesOrdered",
}


def _should_use_bracket_notation(key: str) -> bool:
    """Whether to use bracket notation for a key.

    - Hyphenated keys (e.g. role names with dashes)
    - Purely numeric keys
    - Keys containing a single quote (so we can escape it safely)
    """

    return "-" in key or key.isdigit() or "'" in key


def append_path_segment(prefix: str, segment: str) -> str:
    """Append a segment to an existing path.

    - Hyphenated or numeric keys use Jinja2-style bracket notation.
    - Single quotes inside the key are escaped.
    """

    if not prefix:
        # Top-level keeps the raw key (TypeScript implementation behavior)
        return segment

    if _should_use_bracket_notation(segment):
        escaped = segment.replace("'", "\\'")
        # Numeric keys are represented as strings in bracket notation as well.
        return f"{prefix}['{escaped}']"

    return f"{prefix}.{segment}"


# --- Flatten context -------------------------------------------------------------------


@dataclass
class FlatItem:
    path: str
    value: str


def _is_primitive(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


def flatten_context_to_paths(obj: Any, base_path: str) -> list[dict[str, str]]:
    """Recursively flatten context into a list of ``{\"path\", \"value\"}`` dicts.

    Mirrors the behavior of the frontend ``flattenContextToPaths``:
    - walks nested objects
    - expands ordered lists with 1-based indices
    - expands primitive arrays with 0-based indices
    - skips arrays of objects except for specific ordered/rows cases
    """

    out: list[FlatItem] = []

    def walk(current: Any, path: str) -> None:
        if current is None:
            return

        # Plain object (mapping)
        if isinstance(current, Mapping) and not isinstance(current, list):
            record: Mapping[str, Any] = current
            for key, val in record.items():
                if is_hidden_key(key):
                    continue

                next_path = append_path_segment(path, key)

                # Ordered list keys: expand logical indices [1..n]
                if isinstance(val, list) and key in ORDERED_LIST_KEYS:
                    for i in range(1, len(val)):
                        elem = val[i]
                        if elem is None:
                            continue
                        if path:
                            ordered_path = f"{path}.{key}[{i}]"
                        else:
                            ordered_path = f"{key}[{i}]"
                        walk(elem, ordered_path)
                    continue

                # Nested ordered list keys (tablesOrdered)
                if isinstance(val, list) and key in NESTED_ORDERED_LIST_KEYS:
                    for i in range(1, len(val)):
                        elem = val[i]
                        if elem is None:
                            continue
                        if path:
                            ordered_path = f"{path}.{key}[{i}]"
                        else:
                            ordered_path = f"{key}[{i}]"
                        walk(elem, ordered_path)
                    continue

                # rows: array of objects -> expand each row with 0-based indices
                if isinstance(val, list) and key == "rows":
                    is_array_of_objects = len(val) == 0 or all(
                        (v is not None)
                        and isinstance(v, Mapping)
                        and not isinstance(v, list)
                        for v in val
                    )
                    if is_array_of_objects:
                        for i, elem in enumerate(val):
                            if elem is None:
                                continue
                            if path:
                                rows_path = f"{path}.rows[{i}]"
                            else:
                                rows_path = f"rows[{i}]"
                            walk(elem, rows_path)
                    # Either way we do not treat "rows" itself as a primitive path here.
                    continue

                # Generic arrays
                if isinstance(val, list):
                    all_primitive = all(_is_primitive(v) for v in val)
                    if all_primitive:
                        for i, v in enumerate(val):
                            if v is None:
                                continue
                            if path:
                                arr_path = f"{path}.{key}[{i}]"
                            else:
                                arr_path = f"{key}[{i}]"
                            out.append(FlatItem(path=arr_path, value=str(v)))
                    # Non-primitive arrays (arrays of objects) are not expanded.
                    continue

                # Non-array value: recurse further
                walk(val, next_path)
            return

        # Bare list at root or non-mapping: only primitive leaf values are emitted.
        if isinstance(current, list):
            # The TS implementation returns early for arrays that aren't under keys,
            # so we mimic that by not emitting anything here.
            return

        # Primitive leaf
        out.append(FlatItem(path=base_path if path == "" else path, value=str(current)))

    # Start recursion
    walk(obj, base_path)

    # Convert dataclass instances to plain dicts for easier interop
    return [dict(path=item.path, value=item.value) for item in out]


# --- Path classification and strategy scoring -----------------------------------------


def is_ordered_path(path: str) -> bool:
    """Return True for paths like ``reportWorkersOrdered[1]``."""

    return bool(re.search(r"\w+Ordered\[\d+\]", path))


def is_key_path(path: str) -> bool:
    """Return True when path contains key-based access markers."""

    return any(
        marker in path for marker in ("ByRole", "ById", "ByWorkerId", "ByTagNumber")
    )


def is_primary_path(path: str) -> bool:
    """Return True when path refers to a 'Primary' entry."""

    return "Primary" in path


MatchStrategy = Literal["ordered", "key", "primary"]


def _score_path(path: str, other: str, strategy: MatchStrategy) -> int:
    ordered = is_ordered_path(path)
    key = is_key_path(path)

    if strategy == "ordered":
        if ordered:
            return 3
        if key:
            return 2
        return 0

    if strategy == "key":
        if key:
            return 3
        if ordered:
            return 2
        return 0

    # strategy == "primary"
    if len(path) < len(other):
        return 3
    if ordered:
        return 2
    if key:
        return 1
    return 0


def choose_path(a: str, b: str, strategy: MatchStrategy = "ordered") -> str:
    """Choose a preferred path for the same value, based on strategy."""

    score_a = _score_path(a, b, strategy)
    score_b = _score_path(b, a, strategy)

    if score_a != score_b:
        return a if score_a > score_b else b

    # Tie-breaker: prefer shorter or equal length path
    return a if len(a) <= len(b) else b


def build_value_to_path_map(
    flat: Iterable[Mapping[str, str]], strategy: MatchStrategy = "ordered"
) -> dict[str, str]:
    """Aggregate ``[{path, value}]`` into a dict of value -> single chosen path.

    - Groups by exact value string.
    - Filters out unstable paths containing ``[`` except for ordered paths.
    - Resolves conflicts with :func:`choose_path`.
    """

    by_value: dict[str, list[str]] = {}
    for item in flat:
        path = item["path"]
        value = item["value"]
        by_value.setdefault(value, []).append(path)

    result: dict[str, str] = {}
    for value, paths in by_value.items():
        stable_paths = [p for p in paths if "[" not in p or is_ordered_path(p)]
        if not stable_paths:
            continue
        chosen = stable_paths[0]
        for p in stable_paths[1:]:
            chosen = choose_path(chosen, p, strategy=strategy)
        result[value] = chosen

    return result


# --- Excluded cell values -------------------------------------------------------------


EXCLUDED_MATCH_VALUES: set[str] = {
    "なし",
    "あり",
    "-",
    "－",
    "—",
    "・",
    "…",
    "○",
    "×",
    "△",
    "／",
    " ",
    "",
}

UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def is_excluded_cell_value(value: str) -> bool:
    """Return True when a cell value should be excluded from auto matching.

    Excludes:
    - purely numeric strings with length < 3
    - specific match values (記号・空文字など)
    - already templated values like ``{{ foo }}``
    - UUID-like strings
    """

    s = str(value).strip()

    if len(s) < 3 and s.isdigit():
        return True

    if s in EXCLUDED_MATCH_VALUES:
        return True

    # already a placeholder
    if re.match(r"^\s*\{\{\s*.+\s*\}\}\s*$", value):
        return True

    if UUID_REGEX.match(s) is not None:
        return True

    return False


# --- High-level matching helper -------------------------------------------------------


def _build_merged_covered_cells(
    merge_cells: Iterable[Mapping[str, int]] | None,
) -> set[tuple[int, int]]:
    """結合セル範囲の「左上以外」のセル座標を (row, col) で返す。0-based 想定。"""

    covered: set[tuple[int, int]] = set()
    for m in merge_cells or []:
        row = int(m.get("row", 0))
        col = int(m.get("col", 0))
        rowspan = int(m.get("rowspan", 1))
        colspan = int(m.get("colspan", 1))
        for r in range(row, row + rowspan):
            for c in range(col, col + colspan):
                if r != row or c != col:
                    covered.add((r, c))
    return covered


@dataclass
class MatchItem:
    row: int
    col: int
    current_value: str
    placeholder: str


def run_match_scan(
    context_data: Any,
    grid_data: list[list[Any]],
    merge_cells: Iterable[Mapping[str, int]] | None = None,
    strategy: MatchStrategy = "ordered",
) -> list[MatchItem]:
    """Run full auto-matching scan on a sheet.

    This mirrors the frontend `runMatchScan` behavior but is implemented on backend
    using the same core matching utilities.
    """

    if context_data is None:
        return []

    flat = flatten_context_to_paths(context_data, "")
    value_to_path = build_value_to_path_map(flat, strategy)
    merged = _build_merged_covered_cells(merge_cells)

    matches: list[MatchItem] = []
    for row_idx, row in enumerate(grid_data):
        row_values = row or []
        for col_idx, raw in enumerate(row_values):
            if raw is None:
                continue
            if (row_idx, col_idx) in merged:
                continue
            str_val = str(raw).strip()
            if is_excluded_cell_value(str_val):
                continue
            path = value_to_path.get(str_val)
            if not path:
                continue
            matches.append(
                MatchItem(
                    row=row_idx,
                    col=col_idx,
                    current_value=str_val,
                    placeholder=f"{{{{ {path} }}}}",
                )
            )

    return matches

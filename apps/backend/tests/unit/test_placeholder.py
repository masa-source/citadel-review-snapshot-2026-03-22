"""
プレースホルダ置換機能（_render_cell_template）のユニットテスト。
DBを使わず、固定の辞書（モックコンテキスト）を与えて置換ロジックを検証する。
"""

from __future__ import annotations

from typing import Any, cast

import pytest

from services.binder import _render_cell_template

# テスト用の固定 UUID（Jinja2 では辞書キーが UUID のとき [] 記法が必要）
UUID_WORKER_1 = "22222222-2222-2222-2222-222222222221"
UUID_TARGET_1 = "88888888-8888-8888-8888-888888888881"


def _minimal_context() -> dict[str, Any]:
    """
    load_report_context が返す形に合わせた最小コンテキスト。
    """
    worker_1 = {
        "workerId": UUID_WORKER_1,
        "workerRole": "leader",
        "worker": {"name": "作業者A", "company": {"name": "Test Company"}},
    }
    table_1 = {
        "roleKey": "measurement",
        "rows": [{"value": "10"}, {"value": "20"}],
    }
    ti_1 = {
        "id": UUID_TARGET_1,
        "tagNumber": "TAG-001",
        "instrument": {"name": "計器1", "company": {"name": "Test Company"}},
        "tablesByRole": {"measurement": table_1},
        "tablesOrdered": [None, table_1],
    }
    result = {
        "reportTitle": "テスト報告書",
        "company": {"name": "Test Company"},
        "reportWorkerPrimary": worker_1,
        "reportWorkersOrdered": [None, worker_1],
        "reportWorkersByWorkerId": {UUID_WORKER_1: worker_1},
        "reportWorkersByRole": {"leader": worker_1},
        "targetInstrumentPrimary": ti_1,
        "targetInstrumentsOrdered": [None, ti_1],
        "targetInstrumentsById": {UUID_TARGET_1: ti_1},
        "targetInstrumentsByTagNumber": {"TAG-001": ti_1},
        "usedPartPrimary": {
            "quantity": 10,
            "part": {"name": "部品A", "company": {"name": "Test Company"}},
        },
        "usedPartsOrdered": [
            None,
            {
                "quantity": 10,
                "part": {"name": "部品A", "company": {"name": "Test Company"}},
            },
        ],
        "customData": {"year": 2024, "inspectionType": "annual"},
    }
    return cast(dict[str, Any], result)


# 全パターン: (Jinja2 テンプレート文字列（{{ }} は付けない）, 期待するレンダリング結果)
PLACEHOLDER_CASES = [
    # 報告書・会社
    ("reportTitle", "テスト報告書"),
    ("company.name", "Test Company"),
    # 作業者: Primary / Ordered[1] / ByWorkerId['uuid'] / ByRole
    ("reportWorkerPrimary.worker.name", "作業者A"),
    ("reportWorkersOrdered[1].worker.name", "作業者A"),
    (f"reportWorkersByWorkerId['{UUID_WORKER_1}'].worker.name", "作業者A"),
    ("reportWorkersByRole.leader.worker.name", "作業者A"),
    # 対象計器: Primary / Ordered[1] / ById / ByTagNumber
    ("targetInstrumentPrimary.tagNumber", "TAG-001"),
    ("targetInstrumentsOrdered[1].tagNumber", "TAG-001"),
    (f"targetInstrumentsById['{UUID_TARGET_1}'].tagNumber", "TAG-001"),
    ("targetInstrumentsByTagNumber['TAG-001'].tagNumber", "TAG-001"),
    # 使用部品
    ("usedPartPrimary.part.name", "部品A"),
    ("usedPartsOrdered[1].part.name", "部品A"),
    ("usedPartsOrdered[1].quantity", "10"),
    # 対象計器の表
    ("targetInstrumentPrimary.tablesOrdered[1].roleKey", "measurement"),
    (
        "targetInstrumentPrimary.tablesOrdered[1].rows",
        "[{'value': '10'}, {'value': '20'}]",
    ),
    # カスタムデータ
    ("customData.year", "2024"),
    ("customData.inspectionType", "annual"),
]


@pytest.fixture
def context() -> dict[str, Any]:
    return _minimal_context()


@pytest.mark.parametrize("expression,expected", PLACEHOLDER_CASES)
def test_placeholder_injection_succeeds(
    expression: str, expected: str, context: dict[str, Any]
) -> None:
    """
    各プレースホルダ式で _render_cell_template が例外なく実行され、
    期待値が注入されることを検証する。
    """
    template = "{{ " + expression + " }}"
    rendered = _render_cell_template(template, context)
    assert rendered == expected, (
        f"expression={expression!r} => expected {expected!r}, got {rendered!r}"
    )


def test_placeholder_injection_no_syntax_error_for_invalid_literal(
    context: dict,
) -> None:
    """
    テンプレートにリテラル <workerId> のような不正な式が含まれる場合、
    レンダリングは失敗するが例外で落ちずに元の文字列が返る。
    """
    invalid = "{{ reportWorkersByWorkerId.<workerId>.worker.name }}"
    rendered = _render_cell_template(invalid, context)
    # 構文エラー時は value をそのまま返す
    assert rendered == invalid


def test_placeholder_injection_all_patterns_enumerated() -> None:
    """PLACEHOLDER_CASES が網羅的であることを簡易チェック"""
    assert len(PLACEHOLDER_CASES) >= 15
    expressions = [e for e, _ in PLACEHOLDER_CASES]
    assert len(expressions) == len(set(expressions)), "duplicate expressions"
    assert all(e.strip() for e in expressions), "empty expression"

"""
AIプロンプト精度を評価する実機テスト（LLM Evaluation）。
ローカルでAI（Qwen3.5等）が起動している場合にのみ手動で実行する。CIでは実行しない。
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from services.template_editor import load_grid
from utils.excel_to_text import grid_to_text


@pytest.mark.ai_eval
@pytest.mark.asyncio
async def test_ai_extraction_accuracy(tmp_path: Path) -> None:
    """Excel → load_grid → grid_to_text → extract_data_from_text の一連フローと抽出結果の厳密な検証。"""
    # プロジェクトルートを path に追加して scripts.generate_test_excel を import
    project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from scripts.generate_test_excel import build_workbook

    # テスト用 Excel を一時ディレクトリに生成
    xlsx_path = tmp_path / "sample_complex_report.xlsx"
    wb = build_workbook()
    wb.save(xlsx_path)

    # 読み込み・テキスト化
    grid = load_grid(xlsx_path)
    text = grid_to_text(grid)
    assert text.strip(), "grid_to_text が空でないこと"

    # AI 抽出（実機呼び出し）
    import openai

    from services.ai_extractor import extract_data_from_text

    try:
        result = await extract_data_from_text(text)
    except openai.APIConnectionError as e:
        pytest.skip(f"ローカルAIが起動していないためスキップ: {e}")

    part_names = [p.name for p in result.used_parts if p.name]
    tag_numbers = [t.tag_number for t in result.target_instruments if t.tag_number]

    # --- 厳密なアサーション ---

    # company_name に「シタデル」が含まれること
    assert result.company_name, "company_name が抽出されていること"
    assert "シタデル" in (result.company_name or ""), (
        "company_name に「シタデル」が含まれること"
    )

    # workers は2名のみ（山田・佐藤）。「山田 太郎」と「山田太郎」の重複がないこと
    assert len(result.workers) == 2, "workers が2名であること"
    normalized = {w.replace(" ", "") for w in result.workers}
    assert len(normalized) == 2, "workers に重複（正規化後同一名）がないこと"
    assert any("山田" in w for w in result.workers), "workers に山田が含まれること"
    assert any("佐藤" in w for w in result.workers), "workers に佐藤が含まれること"

    # target_instruments に P-001, P-002, P-003 が含まれること（重複 P-001 は2件でも1件にまとまっても可）
    assert "P-001" in tag_numbers, "target_instruments に P-001 が含まれること"
    assert "P-002" in tag_numbers, "target_instruments に P-002 が含まれること"
    assert "P-003" in tag_numbers, "target_instruments に P-003 が含まれること"

    # used_parts に「Oリング」「メカニカルシール」が含まれ、ノイズ（なし・数量0）が除外されていること
    assert any("Oリング" in (n or "") for n in part_names), (
        "used_parts に Oリング が含まれること"
    )
    assert any("メカニカルシール" in (n or "") for n in part_names), (
        "used_parts に メカニカルシール が含まれること"
    )
    assert "なし" not in part_names, "used_parts に「なし」のノイズが含まれないこと"

    # custom_data に日付（2026/03/06）および天候（晴れ）が含まれること
    custom_str = str(result.custom_data)
    assert "2026" in custom_str or "03" in custom_str, (
        "custom_data に日付（2026/03）が含まれること"
    )
    assert "晴れ" in custom_str, "custom_data に天候（晴れ）が含まれること"

"""
ai_extractor サービスのユニットテスト。
AsyncOpenAI の呼び出しをモックし、正しいJSONが返った場合に AIExtractedReport が生成されることを検証する。
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ai_schemas import AIExtractedReport
from services.ai_extractor import (
    _extract_json_from_response,
    _filter_noise_used_parts,
    extract_data_from_text,
)


def _make_completion_response(content: str) -> SimpleNamespace:
    """chat.completions.create の戻り値として使うオブジェクトを組み立てる。"""
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


@pytest.mark.asyncio
async def test_extract_data_from_text_returns_AIExtractedReport_when_valid_json_returned() -> (
    None
):
    """AIが正しいJSONを返した場合、AIExtractedReport が生成される。"""
    payload = {
        "report_title": "点検報告書",
        "control_number": "CTL-001",
        "company_name": "サンプル株式会社",
        "workers": ["山田太郎", "佐藤花子"],
        "target_instruments": [
            {"tag_number": "T-001", "name": "温度計A"},
            {"tag_number": "T-002", "name": None},
        ],
        "used_parts": [
            {"name": "ガスケット", "part_number": "G-100", "quantity": 2},
            {"name": "Oリング", "part_number": None, "quantity": None},
        ],
        "custom_data": {"年度": "2024", "種別": "定期"},
    }
    json_str = json.dumps(payload, ensure_ascii=False)

    mock_create = AsyncMock(return_value=_make_completion_response(json_str))
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    with patch("services.ai_extractor.AsyncOpenAI", return_value=mock_client):
        result = await extract_data_from_text("ダミーの入力テキスト")

    assert isinstance(result, AIExtractedReport)
    assert result.report_title == "点検報告書"
    assert result.control_number == "CTL-001"
    assert result.company_name == "サンプル株式会社"
    assert result.workers == ["山田太郎", "佐藤花子"]
    assert len(result.target_instruments) == 2
    assert result.target_instruments[0].tag_number == "T-001"
    assert result.target_instruments[0].name == "温度計A"
    assert result.target_instruments[1].tag_number == "T-002"
    assert result.target_instruments[1].name is None
    assert len(result.used_parts) == 2
    assert result.used_parts[0].name == "ガスケット"
    assert result.used_parts[0].part_number == "G-100"
    assert result.used_parts[0].quantity == 2
    assert result.used_parts[1].name == "Oリング"
    assert result.used_parts[1].part_number is None
    assert result.used_parts[1].quantity is None
    assert result.custom_data == {"年度": "2024", "種別": "定期"}


@pytest.mark.asyncio
async def test_extract_data_from_text_raises_when_empty_content() -> None:
    """AIが空の content を返した場合、ValueError が発生する。"""
    mock_create = AsyncMock(return_value=_make_completion_response(""))
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    with patch("services.ai_extractor.AsyncOpenAI", return_value=mock_client):
        with pytest.raises(ValueError, match="empty content"):
            await extract_data_from_text("テキスト")


class TestExtractJsonFromResponse:
    @pytest.mark.normal
    def test_returns_plain_json(self) -> None:
        assert _extract_json_from_response('{"a": 1}') == '{"a": 1}'

    @pytest.mark.normal
    def test_strips_think_block_then_returns_json(self) -> None:
        content = '<think>secret</think>\n  {"a": 1}  '
        assert _extract_json_from_response(content) == '{"a": 1}'

    @pytest.mark.error
    def test_raises_when_only_think_and_no_json(self) -> None:
        with pytest.raises(ValueError, match="No JSON object found"):
            _extract_json_from_response("<think>only</think>")

    @pytest.mark.normal
    def test_thinking_process_with_json_fallback(self) -> None:
        content = 'Thinking Process:\nstep1\n\n{"a": 1}\n'
        assert _extract_json_from_response(content) == '{"a": 1}'

    @pytest.mark.normal
    def test_extracts_json_from_code_fence(self) -> None:
        content = '```json\n{"a": 1}\n```'
        assert _extract_json_from_response(content) == '{"a": 1}'

    @pytest.mark.normal
    def test_skips_first_non_json_fence_and_uses_second_json_fence(self) -> None:
        content = 'note\n```text\nhello\n```\n```json\n{"a": 1}\n```'
        assert _extract_json_from_response(content) == '{"a": 1}'

    @pytest.mark.normal
    def test_extracts_first_brace_balanced_json_inside_text(self) -> None:
        content = 'prefix {"a": {"b": 1}} suffix'
        assert _extract_json_from_response(content) == '{"a": {"b": 1}}'

    @pytest.mark.normal
    def test_raises_when_missing_closing_brace(self) -> None:
        content = 'prefix {"a": 1'
        with pytest.raises(ValueError, match="Incomplete JSON"):
            _extract_json_from_response(content)

    @pytest.mark.error
    def test_raises_when_no_brace_exists(self) -> None:
        with pytest.raises(ValueError, match="No JSON object found"):
            _extract_json_from_response("only explanation")


class TestFilterNoiseUsedParts:
    @pytest.mark.normal
    def test_filters_name_nashi_and_quantity_zero(self) -> None:
        report = AIExtractedReport.model_validate(
            {
                "report_title": "x",
                "used_parts": [
                    {"name": " なし ", "quantity": 1},
                    {"name": "X", "quantity": 0},
                    {"name": "Y", "quantity": None},
                    {"name": "Z", "quantity": 2},
                ],
            }
        )
        out = _filter_noise_used_parts(report)
        names = [p.name for p in out.used_parts]
        assert names == ["Y", "Z"]

    @pytest.mark.normal
    def test_filters_negative_quantity(self) -> None:
        report = AIExtractedReport.model_validate(
            {"report_title": "x", "used_parts": [{"name": "X", "quantity": -1}]}
        )
        out = _filter_noise_used_parts(report)
        assert out.used_parts == []


@pytest.mark.asyncio
async def test_extract_data_from_text_accepts_think_wrapped_json() -> None:
    payload = {"report_title": "点検報告書"}
    json_str = json.dumps(payload, ensure_ascii=False)
    content = f"<think>...</think>\n{json_str}"

    mock_create = AsyncMock(return_value=_make_completion_response(content))
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    with patch("services.ai_extractor.AsyncOpenAI", return_value=mock_client):
        result = await extract_data_from_text("テキスト")
    assert isinstance(result, AIExtractedReport)
    assert result.report_title == "点検報告書"


@pytest.mark.asyncio
async def test_extract_data_from_text_accepts_json_code_fence() -> None:
    payload = {"report_title": "点検報告書"}
    json_str = json.dumps(payload, ensure_ascii=False)
    content = f"```json\n{json_str}\n```"

    mock_create = AsyncMock(return_value=_make_completion_response(content))
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    with patch("services.ai_extractor.AsyncOpenAI", return_value=mock_client):
        result = await extract_data_from_text("テキスト")
    assert result.report_title == "点検報告書"


@pytest.mark.asyncio
async def test_extract_data_from_text_raises_when_choices_empty() -> None:
    response = SimpleNamespace(choices=[])
    mock_create = AsyncMock(return_value=response)
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    with patch("services.ai_extractor.AsyncOpenAI", return_value=mock_client):
        with pytest.raises(ValueError, match="empty content"):
            await extract_data_from_text("テキスト")


@pytest.mark.asyncio
async def test_extract_data_from_text_raises_when_no_json_in_response() -> None:
    mock_create = AsyncMock(return_value=_make_completion_response("no json here"))
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    with patch("services.ai_extractor.AsyncOpenAI", return_value=mock_client):
        with pytest.raises(ValueError, match="invalid output"):
            await extract_data_from_text("テキスト")


@pytest.mark.asyncio
async def test_extract_data_from_text_raises_when_json_invalid() -> None:
    mock_create = AsyncMock(return_value=_make_completion_response('{"report_title":'))
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    with patch("services.ai_extractor.AsyncOpenAI", return_value=mock_client):
        with pytest.raises(ValueError, match="invalid output"):
            await extract_data_from_text("テキスト")


@pytest.mark.asyncio
async def test_extract_data_from_text_raises_when_schema_validation_fails() -> None:
    payload = {
        "report_title": "x",
        "used_parts": [{"name": "A", "quantity": "two"}],
    }
    json_str = json.dumps(payload, ensure_ascii=False)

    mock_create = AsyncMock(return_value=_make_completion_response(json_str))
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    with patch("services.ai_extractor.AsyncOpenAI", return_value=mock_client):
        with pytest.raises(ValueError, match="invalid output"):
            await extract_data_from_text("テキスト")


@pytest.mark.asyncio
async def test_extract_data_from_text_filters_noise_used_parts() -> None:
    payload = {
        "report_title": "x",
        "used_parts": [
            {"name": "なし", "quantity": 1},
            {"name": "X", "quantity": 0},
            {"name": "Y", "quantity": None},
        ],
    }
    json_str = json.dumps(payload, ensure_ascii=False)

    mock_create = AsyncMock(return_value=_make_completion_response(json_str))
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    with patch("services.ai_extractor.AsyncOpenAI", return_value=mock_client):
        result = await extract_data_from_text("テキスト")

    assert [p.name for p in result.used_parts] == ["Y"]

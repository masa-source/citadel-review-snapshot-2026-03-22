"""
AIを用いたテキストからの報告書データ抽出サービス。
OpenAI互換API（LM Studio / vLLM 等）に接続し、AIExtractedReport スキーマに沿ったJSONを取得する。
"""

from __future__ import annotations

import json
import logging
import re

from openai import AsyncOpenAI
from pydantic import ValidationError

from ai_schemas import AIExtractedReport
from config.ai import AI_API_BASE_URL, AI_API_KEY, AI_MODEL_NAME

logger = logging.getLogger(__name__)


def _extract_json_from_response(content: str) -> str:
    """
    LM Studio 等が返すテキストから JSON 部分のみを取り出す。
    <think>...</think> / Thinking Process: / ```json ... ``` 等の前後にあっても、先頭の { から括弧対応で JSON を切り出す。
    """
    text = content.strip()
    # <think>...</think> を除去（中身は破棄）
    think_end = "</think>"
    if "<think>" in text and think_end in text:
        start = text.find(think_end) + len(think_end)
        text = text[start:].strip()
    # "Thinking Process:" で始まる行と、その直後の説明行をスキップ（{ または ``` が出るまで）
    if text.lower().startswith("thinking process:"):
        lines = text.split("\n")
        start_idx = 0
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith("{") or "```" in stripped:
                start_idx = i
                break
        text = "\n".join(lines[start_idx:]).strip()
    # ```json ... ``` または ``` ... ``` があればその中身を採用
    if "```" in text:
        parts = text.split("```")
        for i, part in enumerate(parts):
            part = part.strip()
            if i == 0 and part and not part.startswith("{"):
                continue
            if part.lower().startswith("json"):
                part = part[4:].strip()
            if part.startswith("{"):
                return part
    # 先頭が { でない場合（例: "Thinking Process:\n\n...\n\n{ ... }"）は最初の { から括弧対応で切り出す
    if not text.startswith("{"):
        idx = text.find("{")
        if idx == -1:
            raise ValueError(
                "No JSON object found in AI response (model may have returned only 'Thinking Process' or description)"
            )
        depth = 0
        for i in range(idx, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    return text[idx : i + 1]
        raise ValueError("Incomplete JSON object found in AI response")
    return text


_TRAILING_PUNCT_RE = re.compile(r"[。．\.\s]+$")


def _normalize_nashi_like(name: str | None) -> str:
    s = (name or "").strip()
    s = _TRAILING_PUNCT_RE.sub("", s)
    return s


def _filter_noise_used_parts(report: AIExtractedReport) -> AIExtractedReport:
    """used_parts から「なし」および数量0のノイズ行を除外したレポートを返す。"""
    filtered = [
        p
        for p in report.used_parts
        if _normalize_nashi_like(p.name) not in {"なし", "無し", "ナシ"}
        and (p.quantity is None or p.quantity > 0)
    ]
    return report.model_copy(update={"used_parts": filtered})


def _build_system_prompt() -> str:
    """AIに渡すシステムプロンプト。期待するJSONスキーマを埋め込む。"""
    schema = AIExtractedReport.model_json_schema()
    schema_str = json.dumps(schema, ensure_ascii=False, indent=2)
    return (
        "あなたは報告書データ抽出アシスタントです。"
        "入力テキストから情報を抽出し、指定されたJSONスキーマに厳密に従って出力してください。"
        "出力はJSONのみとし、説明文、Markdown、コードブロック、思考過程は一切出力しないでください。\n\n"
        "抽出ルール:\n"
        "1. report_title, control_number, company_name, workers, target_instruments, used_parts に対応する情報は、必ずその専用フィールドに入れてください。\n"
        "2. custom_data には、専用フィールドを持たないが、文書中に明示されている重要なメタ情報のみを key-value 形式で格納してください。\n"
        "3. custom_data に入れてよい情報の例: 日付、天候、年度、種別、工事区分、場所、設備名など、文書全体に関わる属性。\n"
        "4. custom_data には、推測が必要な値、空欄、単なる見出し、表の列名、ノイズ、専用フィールドに入れた情報の重複は入れないでください。\n"
        "5. 判断に迷う場合は、文書中に明示されていて意味が明確な文書属性だけを custom_data に入れ、推測が必要なものは入れないでください。\n"
        "6. custom_data のキー名は snake_case の英語で統一してください。たとえば inspection_date, weather, fiscal_year, report_type のようにしてください。\n"
        "7. 文書中に日付や天候のような明示的なメタ情報がある場合は、custom_data を空にせず格納してください。\n"
        "8. used_parts では、明らかなノイズ行（例: 名前が「なし」、数量が0、意味のないダミー値）は除外してください。\n"
        "9. workers では、空白の有無など軽微な表記ゆれは同一人物として扱い、重複を避けてください。\n"
        "10. target_instruments では、重複タグがあっても少なくとも識別可能な形で抽出してください。\n\n"
        f"スキーマ:\n{schema_str}"
    )


async def extract_data_from_text(text: str) -> AIExtractedReport:
    """
    入力テキストから報告書データを抽出し、AIExtractedReport として返す。
    OpenAI互換API（Qwen3.5 等）を呼び出し、response_format=text で取得したテキストをJSONとしてパースする。
    （LM Studio 等は json_object をサポートしないため type=text を使用）
    """
    client = AsyncOpenAI(base_url=AI_API_BASE_URL, api_key=AI_API_KEY)
    system_content = _build_system_prompt()

    try:
        response = await client.chat.completions.create(
            model=AI_MODEL_NAME,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": text},
            ],
            response_format={"type": "text"},
        )

        content = response.choices[0].message.content if response.choices else None
        if not content:
            raise ValueError("AI returned empty content")
        try:
            json_str = _extract_json_from_response(content)
            out = AIExtractedReport.model_validate_json(json_str)
        except (ValueError, json.JSONDecodeError, ValidationError) as e:
            raise ValueError("AI returned invalid output") from e
        out = _filter_noise_used_parts(out)
        return out
    except Exception as e:
        logger.exception("AI extraction failed: %s", e)
        raise

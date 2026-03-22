"""
AI抽出専用のPydanticスキーマ。
DB/API用スキーマ（schemas.py）とは分離し、AIが出力するJSONの構造を型で定義する。
model_json_schema() でプロンプトに埋め込み、期待するJSONをAIに伝えるために使用する。
"""

from typing import Any

from pydantic import BaseModel, Field


class AIExtractedTargetInstrument(BaseModel):
    """AIが抽出する対象計器1件。タグ番号・計器名など。"""

    tag_number: str | None = None
    name: str | None = None


class AIExtractedUsedPart(BaseModel):
    """AIが抽出する使用部品1件。部品名・型番・数量など。"""

    name: str | None = None
    part_number: str | None = None
    quantity: int | None = None


class AIExtractedReport(BaseModel):
    """AIが入力テキストから抽出する報告書データのルートモデル。"""

    report_title: str = ""
    control_number: str | None = None
    company_name: str | None = None
    workers: list[str] = Field(default_factory=list)
    target_instruments: list[AIExtractedTargetInstrument] = Field(default_factory=list)
    used_parts: list[AIExtractedUsedPart] = Field(default_factory=list)
    custom_data: dict[str, Any] = Field(default_factory=dict)

#!/usr/bin/env python3
"""
Export OpenAPI schema from FastAPI application.
Usage: python scripts/export_openapi.py [output_path]

ValidationError スキーマを正規化し、Pydantic/FastAPI のバージョン差による
input/ctx の有無で git diff が発生しないようにする。
ファイルアップロードは Pydantic バージョンで contentMediaType と format が揺れるため、
常に format: "binary" に正規化する。
"""

import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app

# ValidationError に必ず含めるプロパティ（環境差で揺れないように固定）
VALIDATION_ERROR_EXTRA = {
    "input": {"title": "Input"},
    "ctx": {"type": "object", "title": "Context"},
}


def normalize_validation_error_schema(schema: dict) -> None:
    """Pydantic/FastAPI の ValidationError スキーマのバージョン差吸収。
    components.schemas.ValidationError に input/ctx が無ければ追加し、openapi.json の diff を安定させる。"""
    schemas = schema.get("components", {}).get("schemas")
    if not schemas or "ValidationError" not in schemas:
        return
    ve = schemas["ValidationError"]
    props = ve.get("properties")
    if not isinstance(props, dict):
        return
    for key, value in VALIDATION_ERROR_EXTRA.items():
        if key not in props:
            props[key] = value


def normalize_binary_format(obj: dict) -> None:
    """Replace contentMediaType application/octet-stream with format binary (CI/ローカル揺れ防止)."""
    if not isinstance(obj, dict):
        return
    if obj.get("contentMediaType") == "application/octet-stream":
        del obj["contentMediaType"]
        obj["format"] = "binary"
    for v in obj.values():
        if isinstance(v, dict):
            normalize_binary_format(v)
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    normalize_binary_format(item)


def deep_sort_keys(obj):  # noqa: C901
    """Recursively sort all dict keys so schema output is deterministic across runs."""
    if isinstance(obj, dict):
        return {k: deep_sort_keys(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        return [deep_sort_keys(v) for v in obj]
    return obj


def export_openapi(output_path: str = "openapi.json") -> None:
    """Export OpenAPI schema to JSON file."""
    schema = app.openapi()
    normalize_validation_error_schema(schema)
    normalize_binary_format(schema)
    schema = deep_sort_keys(schema)

    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # 改行は常に LF、スキーマは再帰ソート済みで CI/ローカル同一出力
    with open(output_file, "w", encoding="utf-8", newline="\n") as f:
        json.dump(schema, f, indent=2, ensure_ascii=False, sort_keys=True)

    print(f"OpenAPI schema exported to: {output_file.absolute()}")
    print(f"  Title: {schema.get('info', {}).get('title')}")
    print(f"  Version: {schema.get('info', {}).get('version')}")
    print(f"  Paths: {len(schema.get('paths', {}))}")
    print(f"  Schemas: {len(schema.get('components', {}).get('schemas', {}))}")


if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "openapi.json"
    export_openapi(output)

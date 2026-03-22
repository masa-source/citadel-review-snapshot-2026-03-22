"""
CRUD エンドポイントの異常系をパラメータ化で一括テスト（404 Not Found / 422 Validation Error）。
"""

import pytest
from httpx import AsyncClient

NOT_FOUND_UUID = "00000000-0000-0000-0000-000000000000"

# URL path segments for /api/{segment}/{uuid}
CRUD_SEGMENTS = [
    "companies",
    "workers",
    "instruments",
    "parts",
    "sites",
    "owned-instruments",
    "schema-definitions",
]

# Valid minimal body for PUT (so that 404 is returned by DB, not 422 by Pydantic)
PUT_404_VALID_BODY = {
    "companies": {"name": "dummy"},
    "workers": {"name": "dummy"},
    "instruments": {"name": "dummy"},
    "parts": {"name": "dummy"},
    "sites": {"name": "dummy"},
    "owned-instruments": {},
    "schema-definitions": {"targetEntity": "report", "version": "1"},
}


@pytest.mark.parametrize("segment", CRUD_SEGMENTS)
@pytest.mark.parametrize("method", ["put", "delete"])
@pytest.mark.asyncio
async def test_crud_404_not_found(
    client: AsyncClient,
    segment: str,
    method: str,
) -> None:
    """存在しない UUID に対して PUT / DELETE を行うと 404 が返る。"""
    url = f"/api/{segment}/{NOT_FOUND_UUID}"
    if method == "put":
        body = PUT_404_VALID_BODY.get(segment, {})
        response = await client.put(url, json=body)
    else:
        response = await client.delete(url)
    assert response.status_code == 404

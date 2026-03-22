"""
CRUD エンドポイントの正常系（200 OK）をパラメータ化で一括テスト。
"""

import pytest
from httpx import AsyncClient

# --- 依存データセットアップ（コールバック関数群） ---


async def setup_companies(client: AsyncClient) -> dict:
    return {
        "create_payload": {"name": "Test Company", "department": "HQ"},
        "update_payload": {"name": "Updated Company", "department": "Branch"},
    }


async def setup_workers(client: AsyncClient) -> dict:
    res = await client.post("/api/companies", json={"name": "Dep Company"})
    company_id = res.json()["id"]
    return {
        "create_payload": {"name": "Test Worker", "companyId": company_id},
        "update_payload": {"name": "Updated Worker", "companyId": company_id},
    }


async def setup_instruments(client: AsyncClient) -> dict:
    res = await client.post("/api/companies", json={"name": "Dep Company"})
    company_id = res.json()["id"]
    return {
        "create_payload": {
            "name": "Test Instrument",
            "modelNumber": "MODEL-1",
            "companyId": company_id,
        },
        "update_payload": {
            "name": "Updated Instrument",
            "modelNumber": "MODEL-2",
            "companyId": company_id,
        },
    }


async def setup_parts(client: AsyncClient) -> dict:
    res = await client.post("/api/companies", json={"name": "Dep Company"})
    company_id = res.json()["id"]
    return {
        "create_payload": {
            "name": "Test Part",
            "partNumber": "P-1",
            "companyId": company_id,
        },
        "update_payload": {
            "name": "Updated Part",
            "partNumber": "P-2",
            "companyId": company_id,
        },
    }


async def setup_sites(client: AsyncClient) -> dict:
    res = await client.post("/api/companies", json={"name": "Dep Company"})
    company_id = res.json()["id"]
    return {
        "create_payload": {"name": "Test Site", "companyId": company_id},
        "update_payload": {"name": "Updated Site", "companyId": company_id},
    }


async def setup_owned_instruments(client: AsyncClient) -> dict:
    comp_res = await client.post("/api/companies", json={"name": "Dep Company"})
    company_id = comp_res.json()["id"]
    inst_res = await client.post(
        "/api/instruments", json={"name": "Dep Inst", "companyId": company_id}
    )
    instrument_id = inst_res.json()["id"]
    return {
        "create_payload": {
            "managementNumber": "MN-1",
            "instrumentId": instrument_id,
            "companyId": company_id,
        },
        "update_payload": {
            "managementNumber": "MN-2",
            "instrumentId": instrument_id,
            "companyId": company_id,
        },
    }


async def setup_schema_definitions(client: AsyncClient) -> dict:
    return {
        "create_payload": {
            "targetEntity": "report",
            "version": "v1",
            "jsonSchema": {"type": "object"},
        },
        "update_payload": {
            "targetEntity": "report",
            "version": "v2",
            "jsonSchema": {"type": "string"},
        },
    }


async def setup_table_definitions(client: AsyncClient) -> dict:
    return {
        "create_payload": {"name": "Test Table", "columns": [{"key": "col1"}]},
        "update_payload": {
            "name": "Updated Table",
            "columns": [{"key": "col1"}, {"key": "col2"}],
        },
    }


# セグメントマッピング
SETUP_FUNCTIONS = {
    "companies": setup_companies,
    "workers": setup_workers,
    "instruments": setup_instruments,
    "parts": setup_parts,
    "sites": setup_sites,
    "owned-instruments": setup_owned_instruments,
    "schema-definitions": setup_schema_definitions,
    "table-definitions": setup_table_definitions,
}

CRUD_SEGMENTS = list(SETUP_FUNCTIONS.keys())


# --- テスト関数の本体 ---


@pytest.mark.parametrize("segment", CRUD_SEGMENTS)
@pytest.mark.asyncio
async def test_crud_normal_lifecycle(client: AsyncClient, segment: str) -> None:
    """指定されたセグメントの正常系 CRUD (Create -> Read -> Update -> Delete) サイクルをテストする。"""
    # 依存データの準備とペイロードの取得
    setup_fn = SETUP_FUNCTIONS[segment]
    payloads = await setup_fn(client)
    create_payload = payloads["create_payload"]
    update_payload = payloads["update_payload"]

    base_url = f"/api/{segment}"

    # 1. Create (POST)
    create_res = await client.post(base_url, json=create_payload)
    assert create_res.status_code == 200, f"Create failed: {create_res.text}"
    created_data = create_res.json()
    assert "id" in created_data
    created_id = created_data["id"]

    # プロパティ検証（ランダムに1つ以上）
    for k, v in create_payload.items():
        if k in created_data:
            assert created_data[k] == v

    # 2. Read (GET List)
    list_res = await client.get(base_url)
    assert list_res.status_code == 200, f"Read failed: {list_res.text}"
    items = list_res.json()
    assert isinstance(items, list)
    assert any(item.get("id") == created_id for item in items), (
        "Created item not found in list"
    )

    # 3. Update (PUT)
    update_res = await client.put(f"{base_url}/{created_id}", json=update_payload)
    assert update_res.status_code == 200, f"Update failed: {update_res.text}"
    updated_data = update_res.json()
    assert updated_data["id"] == created_id

    # 更新内容の検証
    for k, v in update_payload.items():
        if k in updated_data:
            assert updated_data[k] == v

    # 4. Delete (DELETE)
    delete_res = await client.delete(f"{base_url}/{created_id}")
    assert delete_res.status_code == 200, f"Delete failed: {delete_res.text}"

    # 5. Read (GET List again to confirm deletion)
    list_res2 = await client.get(base_url)
    assert list_res2.status_code == 200
    items2 = list_res2.json()
    assert not any(item.get("id") == created_id for item in items2), (
        "Deleted item still found in list"
    )

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ReportTemplate
from tests.api.templates_api_test_utils import (
    ng_quarantine,
    ok_quarantine,
)


class TestTemplatesSyncFile:
    @pytest.mark.asyncio
    async def test_sync_file_when_file_path_blank_returns_400(
        self,
        templates_client: AsyncClient,
    ) -> None:
        res = await templates_client.post(
            "/api/templates/sync-file", json={"filePath": "   "}
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_sync_file_when_path_traversal_returns_400(
        self,
        templates_client: AsyncClient,
    ) -> None:
        res = await templates_client.post(
            "/api/templates/sync-file",
            json={"filePath": "../outside.xlsx"},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_sync_file_when_file_not_found_returns_404(
        self,
        templates_client: AsyncClient,
    ) -> None:
        res = await templates_client.post(
            "/api/templates/sync-file",
            json={"filePath": "templates/not-found.xlsx"},
        )
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_sync_file_when_quarantine_fails_returns_400(
        self,
        templates_client: AsyncClient,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        p = worker_tmp_dir / "templates" / "q.xlsx"
        p.write_bytes(b"x")
        monkeypatch.setattr(
            "routers.templates.quarantine_xlsx",
            lambda **_: ng_quarantine("bad"),
        )
        res = await templates_client.post(
            "/api/templates/sync-file",
            json={"filePath": "templates/q.xlsx"},
        )
        assert res.status_code == 400
        assert res.json()["detail"] == "bad"

    @pytest.mark.asyncio
    async def test_sync_file_when_already_registered_returns_409(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        p = worker_tmp_dir / "templates" / "dup.xlsx"
        p.write_bytes(b"x")
        db_session.add(ReportTemplate(name="dup", file_path="templates/dup.xlsx"))
        await db_session.commit()

        monkeypatch.setattr(
            "routers.templates.quarantine_xlsx",
            lambda **_: ok_quarantine(),
        )
        res = await templates_client.post(
            "/api/templates/sync-file",
            json={"filePath": "templates/dup.xlsx"},
        )
        assert res.status_code == 409

    @pytest.mark.asyncio
    async def test_sync_file_creates_template_with_mtime(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        p = worker_tmp_dir / "templates" / "ok.xlsx"
        p.write_bytes(b"x")
        monkeypatch.setattr(
            "routers.templates.quarantine_xlsx",
            lambda **_: ok_quarantine(),
        )

        res = await templates_client.post(
            "/api/templates/sync-file",
            json={"filePath": "templates/ok.xlsx"},
        )
        assert res.status_code == 200, res.text
        created_id = res.json()["id"]

        row = await db_session.execute(
            select(ReportTemplate).where(ReportTemplate.id == created_id)
        )
        tpl = row.scalar_one()
        assert tpl.file_path == "templates/ok.xlsx"
        assert tpl.last_verified_mtime is not None

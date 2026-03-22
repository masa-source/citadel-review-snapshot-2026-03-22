from __future__ import annotations

import errno
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ReportTemplate


class TestTemplatesGridPost:
    @pytest.mark.asyncio
    async def test_update_template_grid_when_file_modified_returns_409(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        p = worker_tmp_dir / "templates" / "g.xlsx"
        p.write_bytes(b"x")
        tpl = ReportTemplate(
            name="t", file_path="templates/g.xlsx", last_verified_mtime=1.0
        )
        db_session.add(tpl)
        await db_session.commit()
        await db_session.refresh(tpl)

        monkeypatch.setattr("routers.templates.save_grid", lambda *_, **__: None)
        # bump mtime by rewriting
        p.write_bytes(b"y")

        res = await templates_client.post(
            f"/api/templates/{tpl.id}/grid",
            json={"changes": [], "forceOverwrite": False, "useExcelInstance": False},
        )
        assert res.status_code == 409, res.text
        assert res.json()["detail"]["code"] == "FILE_MODIFIED_EXTERNALLY"

    @pytest.mark.asyncio
    async def test_update_template_grid_when_file_in_use_returns_409(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        p = worker_tmp_dir / "templates" / "g2.xlsx"
        p.write_bytes(b"x")
        tpl = ReportTemplate(
            name="t", file_path="templates/g2.xlsx", last_verified_mtime=None
        )
        db_session.add(tpl)
        await db_session.commit()
        await db_session.refresh(tpl)

        def _raise():
            e = PermissionError("Access is denied")
            e.errno = errno.EACCES
            raise e

        monkeypatch.setattr("routers.templates.save_grid", lambda *_, **__: _raise())
        res = await templates_client.post(
            f"/api/templates/{tpl.id}/grid",
            json={"changes": [], "forceOverwrite": True, "useExcelInstance": False},
        )
        assert res.status_code == 409, res.text
        assert res.json()["detail"]["code"] == "FILE_IN_USE"


class TestTemplatesGridGet:
    @pytest.mark.asyncio
    async def test_get_template_grid_when_sheet_names_invalid_json_sets_flag_only(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        p = worker_tmp_dir / "templates" / "gg.xlsx"
        p.write_bytes(b"x")
        tpl = ReportTemplate(
            name="t", file_path="templates/gg.xlsx", sheet_names="not-json"
        )
        db_session.add(tpl)
        await db_session.commit()
        await db_session.refresh(tpl)

        monkeypatch.setattr("routers.templates.verify_template_safety", AsyncMock())
        monkeypatch.setattr(
            "routers.templates.load_grid",
            lambda _p: {"sheets": [{"name": "S1"}, {"name": "S2"}]},
        )

        res = await templates_client.get(f"/api/templates/{tpl.id}/grid")
        assert res.status_code == 200, res.text
        assert res.json().get("storedSheetNamesMissing") is True

        row = await db_session.execute(
            select(ReportTemplate).where(ReportTemplate.id == tpl.id)
        )
        updated = row.scalar_one()
        assert updated.sheet_names == "not-json"

    @pytest.mark.asyncio
    async def test_get_template_grid_when_verify_template_safety_locks_returns_409(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        p = worker_tmp_dir / "templates" / "gg2.xlsx"
        p.write_bytes(b"x")
        tpl = ReportTemplate(name="t", file_path="templates/gg2.xlsx", sheet_names="[]")
        db_session.add(tpl)
        await db_session.commit()
        await db_session.refresh(tpl)

        async def _raise(*_args, **_kwargs):
            raise PermissionError("locked")

        monkeypatch.setattr("routers.templates.verify_template_safety", _raise)
        res = await templates_client.get(f"/api/templates/{tpl.id}/grid")
        assert res.status_code == 409, res.text
        detail = res.json()["detail"]
        assert detail["code"] == "FILE_IN_USE"

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ReportFormatTemplate, ReportTemplate


class TestTemplatesDelete:
    @pytest.mark.asyncio
    async def test_delete_template_deletes_links_too(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        tpl = ReportTemplate(name="t", file_path=None)
        db_session.add(tpl)
        await db_session.commit()
        await db_session.refresh(tpl)

        link = ReportFormatTemplate(
            report_template_id=tpl.id, report_format_id=None, sort_order=1
        )
        db_session.add(link)
        await db_session.commit()

        res = await templates_client.delete(f"/api/templates/{tpl.id}")
        assert res.status_code == 200, res.text

        row = await db_session.execute(
            select(ReportFormatTemplate).where(
                ReportFormatTemplate.report_template_id == tpl.id
            )
        )
        assert row.scalars().all() == []

    @pytest.mark.asyncio
    async def test_delete_template_when_unlink_fails_returns_409_and_keeps_db(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # file exists on disk
        p = worker_tmp_dir / "templates" / "del.xlsx"
        p.write_bytes(b"x")
        tpl = ReportTemplate(name="t", file_path="templates/del.xlsx")
        db_session.add(tpl)
        await db_session.commit()
        await db_session.refresh(tpl)
        tpl_id = tpl.id

        def _raise():
            raise PermissionError("locked")

        monkeypatch.setattr("pathlib.Path.unlink", lambda *_a, **_k: _raise())

        res = await templates_client.delete(f"/api/templates/{tpl_id}")
        assert res.status_code == 409, res.text
        assert res.json()["detail"]["code"] == "FILE_IN_USE"

        row = await db_session.execute(
            select(ReportTemplate).where(ReportTemplate.id == tpl_id)
        )
        assert row.scalar_one_or_none() is not None

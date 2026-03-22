from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import ReportTemplate


class TestTemplatesRevalidate:
    @pytest.mark.asyncio
    async def test_revalidate_when_backup_permission_error_returns_409(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        p = worker_tmp_dir / "templates" / "r.xlsx"
        p.write_bytes(b"x")
        tpl = ReportTemplate(name="t", file_path="templates/r.xlsx")
        db_session.add(tpl)
        await db_session.commit()
        await db_session.refresh(tpl)

        monkeypatch.setattr(
            "routers.templates.shutil.copy2",
            lambda *_args, **_kw: (_ for _ in ()).throw(PermissionError("denied")),
        )
        res = await templates_client.post(
            f"/api/templates/{tpl.id}/revalidate",
            json={"newFilePath": None, "forceContinue": False},
        )
        assert res.status_code == 409, res.text
        assert res.json()["detail"]["code"] == "BACKUP_FAILED"

    @pytest.mark.asyncio
    async def test_revalidate_when_quarantine_oserror_13_returns_400(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        p = worker_tmp_dir / "templates" / "r2.xlsx"
        p.write_bytes(b"x")
        tpl = ReportTemplate(name="t", file_path="templates/r2.xlsx")
        db_session.add(tpl)
        await db_session.commit()
        await db_session.refresh(tpl)

        err = OSError("permission denied")
        err.errno = 13
        monkeypatch.setattr(
            "routers.templates.quarantine_xlsx",
            lambda **_: (_ for _ in ()).throw(err),
        )

        res = await templates_client.post(
            f"/api/templates/{tpl.id}/revalidate",
            json={"newFilePath": None, "forceContinue": True},
        )
        assert res.status_code == 409, res.text
        assert res.json()["detail"]["code"] == "FILE_IN_USE"

    @pytest.mark.asyncio
    async def test_revalidate_when_quarantine_permission_error_returns_409_file_in_use(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        p = worker_tmp_dir / "templates" / "r3.xlsx"
        p.write_bytes(b"x")
        tpl = ReportTemplate(name="t", file_path="templates/r3.xlsx")
        db_session.add(tpl)
        await db_session.commit()
        await db_session.refresh(tpl)

        monkeypatch.setattr(
            "routers.templates.quarantine_xlsx",
            lambda **_: (_ for _ in ()).throw(PermissionError("locked")),
        )

        res = await templates_client.post(
            f"/api/templates/{tpl.id}/revalidate",
            json={"newFilePath": None, "forceContinue": True},
        )
        assert res.status_code == 409, res.text
        detail = res.json()["detail"]
        assert detail["code"] == "FILE_IN_USE"

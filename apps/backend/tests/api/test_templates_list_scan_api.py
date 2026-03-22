from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import ReportTemplate


class TestTemplatesListAndScan:
    @pytest.mark.asyncio
    async def test_get_templates_file_exists_branches(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
    ) -> None:
        # file_path None
        t_none = ReportTemplate(name="n", file_path=None)

        # file exists
        (worker_tmp_dir / "templates" / "exists.xlsx").write_bytes(b"x")
        t_exists = ReportTemplate(name="e", file_path="templates/exists.xlsx")

        # file missing
        t_missing = ReportTemplate(name="m", file_path="templates/missing.xlsx")

        db_session.add_all([t_none, t_exists, t_missing])
        await db_session.commit()

        res = await templates_client.get("/api/templates")
        assert res.status_code == 200, res.text
        body = res.json()
        by_name = {r["name"]: r for r in body}
        assert by_name["n"]["fileExists"] is False
        assert by_name["e"]["fileExists"] is True
        assert by_name["m"]["fileExists"] is False

    @pytest.mark.asyncio
    async def test_scan_templates_detects_new_files_and_missing_from_disk(
        self,
        templates_client: AsyncClient,
        db_session: AsyncSession,
        worker_tmp_dir: Path,
    ) -> None:
        # disk: new + excluded
        (worker_tmp_dir / "templates" / "new.xlsx").write_bytes(b"x")
        (worker_tmp_dir / "templates" / "~$temp.xlsx").write_bytes(b"x")
        (worker_tmp_dir / "templates" / "skip.tmp").write_bytes(b"x")

        # db: one missing
        t_missing = ReportTemplate(name="db-missing", file_path="templates/db.xlsx")
        db_session.add(t_missing)
        await db_session.commit()

        res = await templates_client.get("/api/templates/scan")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["inconsistent"] is True
        assert "templates/new.xlsx" in body["newFiles"]
        assert "templates/~$temp.xlsx" not in body["newFiles"]
        assert "templates/skip.tmp" not in body["newFiles"]
        assert any(i["id"] == str(t_missing.id) for i in body["missingFromDisk"])

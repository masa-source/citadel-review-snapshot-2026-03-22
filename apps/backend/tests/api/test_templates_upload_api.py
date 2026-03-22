from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient

from tests.api.templates_api_test_utils import (
    ng_quarantine,
    ok_quarantine,
)


class TestTemplatesCreateUpload:
    @pytest.mark.asyncio
    async def test_create_template_when_quarantine_fails_returns_400(
        self,
        templates_client: AsyncClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            "routers.templates.quarantine_xlsx",
            lambda **_: ng_quarantine("nope"),
        )
        res = await templates_client.post(
            "/api/templates",
            files={
                "file": (
                    "template.xlsx",
                    b"x",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"name": "n"},
        )
        assert res.status_code == 400
        assert res.json()["detail"] == "nope"

    @pytest.mark.asyncio
    async def test_create_template_when_duplicate_filename_returns_400(
        self,
        templates_client: AsyncClient,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            "routers.templates.quarantine_xlsx",
            lambda **_: ok_quarantine(),
        )
        (worker_tmp_dir / "templates" / "dup.xlsx").write_bytes(b"x")
        res = await templates_client.post(
            "/api/templates",
            files={
                "file": (
                    "dup.xlsx",
                    b"x",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"name": "n"},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_create_template_when_db_commit_fails_does_not_leave_file(
        self,
        templates_client: AsyncClient,
        db_session,
        worker_tmp_dir: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from unittest.mock import AsyncMock

        from sqlalchemy.ext.asyncio import AsyncSession

        assert isinstance(db_session, AsyncSession)
        monkeypatch.setattr(
            "routers.templates.quarantine_xlsx",
            lambda **_: ok_quarantine(),
        )
        db_session.commit = AsyncMock(side_effect=RuntimeError("db down"))  # type: ignore[method-assign]
        preexisting = worker_tmp_dir / "templates" / "will_remain.xlsx"
        if preexisting.exists():
            preexisting.unlink()

        res = await templates_client.post(
            "/api/templates",
            files={
                "file": (
                    "will_remain.xlsx",
                    b"x",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"name": "n"},
        )
        assert res.status_code == 500, res.text
        assert not (worker_tmp_dir / "templates" / "will_remain.xlsx").exists()

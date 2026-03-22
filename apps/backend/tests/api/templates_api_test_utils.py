from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest_asyncio.fixture
async def templates_client(
    client: AsyncClient,
    worker_tmp_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    """templates ルーターの assets パスを worker_tmp_dir に差し替えた client。"""
    monkeypatch.setattr("routers.templates.get_assets_base", lambda: worker_tmp_dir)
    monkeypatch.setattr(
        "routers.templates.get_assets_templates_dir",
        lambda: worker_tmp_dir / "templates",
    )
    (worker_tmp_dir / "templates").mkdir(parents=True, exist_ok=True)
    (worker_tmp_dir / "backup").mkdir(parents=True, exist_ok=True)
    yield client


def ok_quarantine(message: str = "ok") -> SimpleNamespace:
    return SimpleNamespace(ok=True, message=message)


def ng_quarantine(message: str = "ng") -> SimpleNamespace:
    return SimpleNamespace(ok=False, message=message)

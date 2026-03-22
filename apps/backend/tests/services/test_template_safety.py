"""
template_safety.py のインテグレーションテスト
"""

import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from models import ReportTemplate
from services.template_safety import verify_template_safety


@pytest.mark.asyncio
async def test_verify_template_safety_permission_error_raises_http_409(
    db_session: AsyncSession,
) -> None:
    """quarantine_xlsx が PermissionError を投げた際に HTTPException 409 に変換される。"""
    path = MagicMock(spec=Path)
    path.stat.return_value = MagicMock(st_mtime=12345.0)
    template = ReportTemplate(
        id=uuid.uuid4(),
        name="Test",
        file_path="/tmp/locked.xlsx",
        last_verified_mtime=None,
    )
    with patch("services.template_safety.quarantine_xlsx", side_effect=PermissionError):
        with pytest.raises(HTTPException) as exc_info:
            await verify_template_safety(path, template, db_session)
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "FILE_IN_USE"


@pytest.mark.asyncio
async def test_verify_template_safety_oserror_errno13_raises_http_409(
    db_session: AsyncSession,
) -> None:
    """quarantine_xlsx が OSError(errno=13) を投げた際に HTTPException 409 に変換される。"""
    path = MagicMock(spec=Path)
    path.stat.return_value = MagicMock(st_mtime=12345.0)
    template = ReportTemplate(
        id=uuid.uuid4(),
        name="Test",
        file_path="/tmp/locked.xlsx",
        last_verified_mtime=None,
    )
    err = OSError()
    err.errno = 13
    with patch("services.template_safety.quarantine_xlsx", side_effect=err):
        with pytest.raises(HTTPException) as exc_info:
            await verify_template_safety(path, template, db_session)
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "FILE_IN_USE"


@pytest.mark.asyncio
async def test_verify_template_safety_oserror_other_raises_http_500(
    db_session: AsyncSession,
) -> None:
    """quarantine_xlsx が OSError(その他) を投げた際に HTTPException 500 に変換される。"""
    path = MagicMock(spec=Path)
    path.stat.return_value = MagicMock(st_mtime=12345.0)
    template = ReportTemplate(
        id=uuid.uuid4(),
        name="Test",
        file_path="/tmp/missing.xlsx",
        last_verified_mtime=None,
    )
    err = OSError(2, "No such file")
    with patch("services.template_safety.quarantine_xlsx", side_effect=err):
        with pytest.raises(HTTPException) as exc_info:
            await verify_template_safety(path, template, db_session)
    assert exc_info.value.status_code == 500
    assert "読み込みに失敗" in (exc_info.value.detail or "")

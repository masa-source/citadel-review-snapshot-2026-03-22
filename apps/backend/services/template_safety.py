"""
テンプレートのスマート検疫。
ファイルの mtime が前回検疫時と一致すれば検疫をスキップし、
不一致または未検疫の場合は quarantine_xlsx を実行してから DB の last_verified_mtime を更新する。
"""

import logging
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from error_codes import FILE_IN_USE
from models import ReportTemplate
from utils.quarantine import quarantine_xlsx

logger = logging.getLogger(__name__)


def _is_file_in_use_error(e: BaseException) -> bool:
    if isinstance(e, PermissionError):
        return True
    msg = str(e).lower()
    return bool(
        getattr(e, "errno", None) in (13, 32)
        or "used by another process" in msg
        or "permission denied" in msg
        or "access is denied" in msg
        or "being used" in msg
    )


async def verify_template_safety(
    file_path: Path,
    template: ReportTemplate,
    session: AsyncSession,
) -> None:
    """
    スマート検疫: ファイルの mtime が前回検疫時と一致すれば検疫をスキップし、
    不一致または未検疫の場合は quarantine_xlsx を実行してから DB の last_verified_mtime を更新する。
    検疫に失敗した場合やファイルがロックされている場合は HTTPException を投げる。
    """
    current_mtime = file_path.stat().st_mtime
    if (
        template.last_verified_mtime is not None
        and current_mtime == template.last_verified_mtime
    ):
        return

    try:
        result = quarantine_xlsx(file_path=file_path)
    except (PermissionError, OSError) as e:
        if _is_file_in_use_error(e):
            logger.warning("テンプレートファイルがロックされています: %s", file_path)
            raise HTTPException(
                status_code=409,
                detail={
                    "code": FILE_IN_USE,
                    "message": "このファイルは別のアプリ（Excel など）で開かれている可能性があります。ファイルを閉じてから再試行してください。",
                },
            ) from e
        raise HTTPException(
            status_code=500,
            detail=f"ファイルの読み込みに失敗しました。{e!s}",
        ) from e

    if not result.ok:
        raise HTTPException(status_code=400, detail=result.message)

    template.last_verified_mtime = current_mtime
    session.add(template)
    # commit は呼び出し側で制御する（GET 等の副作用を避けるため）

"""
レポート API 用のビジネスロジック（一覧・カスケード削除）。
PDF/Excel 生成は services.binder / db_loader をルーターから直接利用する。
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import Report


async def list_reports(session: AsyncSession) -> list[dict]:
    """レポート一覧を会社名 JOIN で取得。作成日降順。"""
    result = await session.execute(
        select(Report)
        .options(selectinload(Report.company), selectinload(Report.report_format))
        .order_by(desc(Report.created_at))
    )
    reports = result.scalars().all()
    return [
        {
            "id": r.id,
            "report_title": r.report_title,
            "control_number": r.control_number,
            "created_at": r.created_at.isoformat()
            if isinstance(r.created_at, datetime)
            else r.created_at,
            "report_format_name": (
                r.report_format.name if getattr(r, "report_format", None) else None
            ),
            "company_name": r.company.name if r.company else None,
        }
        for r in reports
        if r.id is not None
    ]


async def delete_report_cascade(session: AsyncSession, report_id: UUID) -> bool:
    """
    指定レポートとその関連データをカスケード削除する。
    モデルの Relationship(cascade="all, delete-orphan") により子テーブルは自動削除される。
    レポートが存在すれば True、しなければ False。
    """
    ok = await delete_report_cascade_logic(session, report_id)
    if ok:
        await session.commit()
    return ok


async def delete_report_cascade_logic(session: AsyncSession, report_id: UUID) -> bool:
    """
    削除ロジックのみ（commitなし）。importer 等のトランザクション内で利用。
    """
    result = await session.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        return False
    await session.delete(report)
    await session.flush()
    return True

"""レポート種別（ReportFormat）とそのテンプレート構成の API。"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import ReportFormat, ReportFormatTemplate, ReportTemplate
from schemas import (
    ReportFormatCreate,
    ReportFormatTemplatesUpdate,
    ReportFormatUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["report-formats"])


@router.get("/report-formats")
async def list_report_formats(
    session: AsyncSession = Depends(get_session),
):
    """レポート種別一覧を返す。Scout の報告書種別ドロップダウン等で使用。"""
    result = await session.execute(
        select(ReportFormat).order_by(ReportFormat.name, ReportFormat.id)
    )
    formats = result.scalars().all()
    return [{"id": f.id, "name": f.name} for f in formats]


@router.post("/report-formats")
async def create_report_format(
    body: ReportFormatCreate,
    session: AsyncSession = Depends(get_session),
):
    """レポート種別を 1 件作成。id は UUID で自動生成。"""
    fmt = ReportFormat(name=body.name)
    session.add(fmt)
    await session.commit()
    await session.refresh(fmt)
    return {"id": fmt.id, "name": fmt.name}


@router.put("/report-formats/{format_id}")
async def update_report_format(
    format_id: UUID,
    body: ReportFormatUpdate,
    session: AsyncSession = Depends(get_session),
):
    """レポート種別の名前を更新。"""
    result = await session.execute(
        select(ReportFormat).where(ReportFormat.id == format_id)
    )
    fmt = result.scalar_one_or_none()
    if not fmt:
        raise HTTPException(status_code=404, detail="レポート種別が見つかりません。")
    if body.name is not None:
        fmt.name = body.name
    await session.commit()
    await session.refresh(fmt)
    return {"id": fmt.id, "name": fmt.name}


@router.delete("/report-formats/{format_id}")
async def delete_report_format(
    format_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """レポート種別とそのテンプレート構成を削除。"""
    result = await session.execute(
        select(ReportFormat).where(ReportFormat.id == format_id)
    )
    fmt = result.scalar_one_or_none()
    if not fmt:
        raise HTTPException(status_code=404, detail="レポート種別が見つかりません。")
    links_result = await session.execute(
        select(ReportFormatTemplate).where(
            ReportFormatTemplate.report_format_id == format_id
        )
    )
    for link in links_result.scalars().all():
        await session.delete(link)
    await session.delete(fmt)
    await session.commit()
    return {"ok": True, "message": "レポート種別を削除しました。"}


@router.get("/report-formats/{format_id}/templates")
async def get_format_templates(
    format_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """指定したレポート種別に紐づくテンプレート部品を sort_order 順で返す。"""
    result = await session.execute(
        select(ReportFormat).where(ReportFormat.id == format_id)
    )
    fmt = result.scalar_one_or_none()
    if not fmt:
        raise HTTPException(status_code=404, detail="レポート種別が見つかりません。")
    links_result = await session.execute(
        select(ReportFormatTemplate, ReportTemplate)
        .join(
            ReportTemplate,
            ReportTemplate.id == ReportFormatTemplate.report_template_id,
        )
        .where(ReportFormatTemplate.report_format_id == format_id)
        .order_by(asc(ReportFormatTemplate.sort_order))
    )
    rows = links_result.all()
    return [
        {
            "id": rft.id,
            "templateId": t.id,
            "name": t.name,
            "filePath": t.file_path,
            "sortOrder": rft.sort_order,
        }
        for rft, t in rows
    ]


@router.put("/report-formats/{format_id}/templates")
async def update_format_templates(
    format_id: UUID,
    body: ReportFormatTemplatesUpdate,
    session: AsyncSession = Depends(get_session),
):
    """指定したレポート種別のテンプレート構成を一括更新。既存の紐づけは削除し、body で指定した並びで再登録。"""
    result = await session.execute(
        select(ReportFormat).where(ReportFormat.id == format_id)
    )
    fmt = result.scalar_one_or_none()
    if not fmt:
        raise HTTPException(status_code=404, detail="レポート種別が見つかりません。")

    requested_ids = {i.template_id for i in body.items}
    if requested_ids:
        templates_row = await session.execute(
            select(ReportTemplate.id).where(ReportTemplate.id.in_(requested_ids))  # type: ignore[reportCallIssue]
        )
        existing_ids = set(templates_row.scalars().all())
        missing = sorted(str(i) for i in (requested_ids - existing_ids))
        if missing:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "テンプレートが見つかりません。",
                    "missingTemplateIds": missing,
                },
            )

    existing = await session.execute(
        select(ReportFormatTemplate).where(
            ReportFormatTemplate.report_format_id == format_id
        )
    )
    for link in existing.scalars().all():
        await session.delete(link)
    for item in body.items:
        rft = ReportFormatTemplate(
            report_format_id=format_id,
            report_template_id=item.template_id,
            sort_order=item.sort_order,
        )
        session.add(rft)
    await session.commit()
    return {"ok": True, "message": "構成を更新しました。"}

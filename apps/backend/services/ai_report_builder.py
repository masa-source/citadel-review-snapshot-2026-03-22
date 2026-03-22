"""
AI抽出データ（AIExtractedReport）から Report と関連マスタを検索・作成し、DB に登録する。
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai_schemas import (
    AIExtractedReport,
    AIExtractedTargetInstrument,
    AIExtractedUsedPart,
)
from models import (
    Company,
    Instrument,
    Part,
    Report,
    ReportFormat,
    ReportWorker,
    TargetInstrument,
    UsedPart,
    Worker,
)


async def _get_or_create_company(session: AsyncSession, name: str) -> Company:
    """名前で Company を検索し、なければ新規作成する。"""
    result = await session.execute(select(Company).where(Company.name == name).limit(1))
    company = result.scalar_one_or_none()
    if company is not None:
        return company
    company = Company(name=name)
    session.add(company)
    await session.flush()
    return company


async def _get_or_create_worker(
    session: AsyncSession, name: str, company_id: uuid.UUID | None
) -> Worker:
    """name と company_id で Worker を検索し、なければ新規作成する。"""
    if company_id is None:
        result = await session.execute(
            select(Worker)
            .where(Worker.name == name, Worker.company_id.is_(None))
            .limit(1)
        )
    else:
        result = await session.execute(
            select(Worker)
            .where(Worker.name == name, Worker.company_id == company_id)
            .limit(1)
        )
    worker = result.scalar_one_or_none()
    if worker is not None:
        return worker
    worker = Worker(name=name, company_id=company_id)
    session.add(worker)
    await session.flush()
    return worker


async def _get_or_create_instrument(
    session: AsyncSession, name: str | None, company_id: uuid.UUID | None
) -> Instrument | None:
    """name と company_id で Instrument を検索し、なければ新規作成する。name が空なら None を返す。"""
    if not (name and name.strip()):
        return None
    name = name.strip()
    if company_id is None:
        result = await session.execute(
            select(Instrument)
            .where(Instrument.name == name, Instrument.company_id.is_(None))
            .limit(1)
        )
    else:
        result = await session.execute(
            select(Instrument)
            .where(Instrument.name == name, Instrument.company_id == company_id)
            .limit(1)
        )
    inst = result.scalar_one_or_none()
    if inst is not None:
        return inst
    inst = Instrument(name=name, company_id=company_id)
    session.add(inst)
    await session.flush()
    return inst


async def _get_or_create_part(
    session: AsyncSession,
    name: str | None,
    part_number: str | None,
    company_id: uuid.UUID | None,
) -> Part | None:
    """name / part_number と company_id で Part を検索（part_number 優先）、なければ新規作成する。"""
    has_name = name and str(name).strip()
    has_pn = part_number and str(part_number).strip()
    if not has_name and not has_pn:
        return None
    name = str(name).strip() if name else None
    part_number = str(part_number).strip() if part_number else None

    # 検索: 両方一致 → part_number 一致 → name 一致の順で優先する。
    if company_id is None:
        base = select(Part).where(Part.company_id.is_(None))
    else:
        base = select(Part).where(Part.company_id == company_id)

    part = None
    if has_pn and has_name:
        result = await session.execute(
            base.where(Part.part_number == part_number, Part.name == name).limit(1)
        )
        part = result.scalar_one_or_none()
    if part is None and has_pn:
        result = await session.execute(
            base.where(Part.part_number == part_number).limit(1)
        )
        part = result.scalar_one_or_none()
    if part is None and has_name:
        result = await session.execute(base.where(Part.name == name).limit(1))
        part = result.scalar_one_or_none()
    if part is not None:
        return part
    part = Part(name=name, part_number=part_number, company_id=company_id)
    session.add(part)
    await session.flush()
    return part


async def _get_or_create_report_format(
    session: AsyncSession, name: str
) -> ReportFormat:
    """名前で ReportFormat を検索し、なければ新規作成する。"""
    result = await session.execute(
        select(ReportFormat).where(ReportFormat.name == name).limit(1)
    )
    report_format = result.scalar_one_or_none()
    if report_format is not None:
        return report_format
    report_format = ReportFormat(name=name)
    session.add(report_format)
    await session.flush()
    return report_format


async def build_report_from_ai_data(
    session: AsyncSession, ai_data: AIExtractedReport
) -> Report:
    """
    AI抽出データから Report と関連マスタ（Company, Worker, Instrument, Part）を
    検索・作成し、ReportWorker / TargetInstrument / UsedPart を紐付けて返す。
    最後に flush し、ID が採番された Report を返す。
    """
    company_id = None
    if ai_data.company_name and str(ai_data.company_name).strip():
        company = await _get_or_create_company(
            session, str(ai_data.company_name).strip()
        )
        company_id = company.id

    report_format = await _get_or_create_report_format(session, "作業報告書")

    report = Report(
        report_title=ai_data.report_title or None,
        control_number=ai_data.control_number,
        company_id=company_id,
        custom_data=ai_data.custom_data if ai_data.custom_data else {},
        report_format_id=report_format.id,
    )
    session.add(report)
    await session.flush()

    for i, worker_name in enumerate(ai_data.workers or []):
        if not (worker_name and str(worker_name).strip()):
            continue
        worker = await _get_or_create_worker(
            session, str(worker_name).strip(), company_id
        )
        rw = ReportWorker(
            report_id=report.id,
            worker_id=worker.id,
            role_key=str(i + 1),
            sort_order=i + 1,
        )
        session.add(rw)

    for i, item in enumerate(ai_data.target_instruments or []):
        if not isinstance(item, AIExtractedTargetInstrument):
            continue
        name = item.name if item.name else None
        inst = await _get_or_create_instrument(session, name, company_id)
        if inst is None:
            continue
        ti = TargetInstrument(
            report_id=report.id,
            instrument_id=inst.id,
            tag_number=item.tag_number,
            sort_order=i + 1,
        )
        session.add(ti)

    for i, item in enumerate(ai_data.used_parts or []):
        if not isinstance(item, AIExtractedUsedPart):
            continue
        part = await _get_or_create_part(
            session,
            item.name,
            item.part_number,
            company_id,
        )
        if part is None:
            continue
        up = UsedPart(
            report_id=report.id,
            part_id=part.id,
            quantity=item.quantity if item.quantity is not None else 0,
            sort_order=i + 1,
        )
        session.add(up)

    await session.flush()
    return report

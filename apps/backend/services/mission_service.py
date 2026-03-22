"""
任務（Mission）のビジネスロジック。
一覧・ハートビート・除名・状態取得を担当する。
"""

from datetime import datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Mission, MissionReport, MissionStatus
from schemas import ExportRequest

MISSION_LIFETIME_HOURS = 24


def _format_datetime_iso(dt: datetime | None) -> str:
    """datetime を ISO 形式文字列に変換（API レスポンス用）。"""
    return dt.isoformat() + "Z" if dt else ""


def _mission_to_response(m: Mission, report_ids: list[UUID]) -> dict:
    """Mission を API レスポンス用 dict に変換（camelCase）。"""
    return {
        "missionId": str(m.mission_id),
        "reportIds": [str(rid) for rid in report_ids if rid is not None],
        "permission": m.permission,
        "issuedAt": _format_datetime_iso(m.issued_at),
        "expiresAt": _format_datetime_iso(m.expires_at),
        "status": m.status,
        "heartbeatAt": _format_datetime_iso(m.heartbeat_at) if m.heartbeat_at else None,
        "deviceId": m.device_id,
    }


async def list_missions(
    session: AsyncSession,
    status: str | None = None,
) -> list[dict]:
    """派遣中の任務一覧。status 指定時はその状態の任務のみ。"""
    q = select(Mission).order_by(Mission.issued_at.desc())
    if status:
        q = q.where(Mission.status == status)
    result = await session.execute(q)
    missions = result.scalars().all()
    out = []
    for m in missions:
        mr_result = await session.execute(
            select(MissionReport).where(MissionReport.mission_id == m.mission_id)
        )
        mrs = mr_result.scalars().all()
        report_ids = [mr.report_id for mr in mrs if mr.report_id is not None]
        out.append(_mission_to_response(m, report_ids))
    return out


async def mission_heartbeat(
    session: AsyncSession,
    mission_id: UUID,
    device_id: str | None,
) -> tuple[dict | None, str | None]:
    """
    任務のハートビートを更新する。
    成功時は (response_dict, None)、Purged/Expired 時は (None, "PURGED")、
    存在しない時は (None, "NOT_FOUND") を返す。
    """
    result = await session.execute(
        select(Mission).where(Mission.mission_id == mission_id).limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        return (None, "NOT_FOUND")
    if row.status in (MissionStatus.PURGED.value, MissionStatus.EXPIRED.value):
        return (None, "PURGED")
    now = datetime.utcnow()
    row.heartbeat_at = now
    if device_id is not None:
        row.device_id = device_id
    await session.commit()
    return (
        {"ok": True, "expiresAt": _format_datetime_iso(row.expires_at)},
        None,
    )


async def mission_purge(
    session: AsyncSession,
    mission_id: UUID,
) -> bool:
    """任務を除名（Purge）する。存在すれば True、しなければ False。"""
    result = await session.execute(
        select(Mission).where(Mission.mission_id == mission_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        return False
    row.status = MissionStatus.PURGED.value
    await session.commit()
    return True


async def mission_get_status(
    session: AsyncSession,
    mission_id: UUID,
) -> dict | None:
    """任務の状態を取得する。存在すれば {missionId, status}、しなければ None。"""
    result = await session.execute(
        select(Mission).where(Mission.mission_id == mission_id).limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        return None
    return {"missionId": str(mission_id), "status": row.status}


async def create_handoff_mission(
    session: AsyncSession,
    criteria: ExportRequest,
) -> tuple[UUID, datetime, datetime, str]:
    """
    Direct Handoff 用に任務 (Mission / MissionReport) を作成する。
    (mission_id, issued_at, expires_at, permission) を返す。
    """
    from fastapi import HTTPException

    permission = criteria.permission

    target_report_ids = [
        UUID(rid) if isinstance(rid, str) else rid
        for rid in (criteria.target_report_ids or [])
    ]

    if permission in ("View", "Edit", "Copy") and not target_report_ids:
        raise HTTPException(
            status_code=400,
            detail="閲覧・編集・コピーの任務では対象レポートを1件以上指定してください。",
        )

    if permission == "Edit" and target_report_ids:
        for report_id in target_report_ids:
            result = await session.execute(
                select(MissionReport)
                .join(Mission, MissionReport.mission_id == Mission.mission_id)
                .where(
                    MissionReport.report_id == report_id,
                    Mission.permission == "Edit",
                    Mission.status == MissionStatus.ACTIVE.value,
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="既にこのレポートに Edit 任務が発行されています。既存の任務を除名（Purge）するまで新しい Edit 任務を発行できません。",
                )

    mission_id = uuid4()
    now = datetime.utcnow()
    expires_at = now + timedelta(hours=MISSION_LIFETIME_HOURS)

    mission = Mission(
        mission_id=mission_id,
        permission=permission,
        issued_at=now,
        expires_at=expires_at,
        status=MissionStatus.ACTIVE.value,
        heartbeat_at=now,
    )
    session.add(mission)

    if permission in ("View", "Edit"):
        for report_id in target_report_ids:
            mr = MissionReport(
                mission_id=mission_id,
                report_id=report_id,
            )
            session.add(mr)

    await session.commit()
    return mission_id, now, expires_at, permission

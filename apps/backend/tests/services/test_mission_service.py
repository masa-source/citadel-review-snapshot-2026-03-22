"""
mission_service.py のインテグレーションテスト
"""

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from models import Mission, MissionReport, MissionStatus
from schemas import ExportRequest
from services.mission_service import create_handoff_mission


async def _setup_reports(db_session):
    """テスト用のレポートレコードを事前に作成する"""
    from tests.factories import insert_report

    # 固定IDではなく、新規生成されたレポートのリストを返すようにする（あるいは各テストで個別に作成する）
    r1 = await insert_report(db_session, report_title="Test 1", report_type="test")
    r2 = await insert_report(db_session, report_title="Test 2", report_type="test")
    await db_session.flush()
    return r1.id, r2.id


@pytest.mark.asyncio
async def test_create_handoff_mission_collect_minimal(db_session):
    """正常系: 収集(Collect)モード、レポート指定なし"""
    criteria = ExportRequest(include_companies=True, permission="Collect")
    mission_id, issued_at, expires_at, permission = await create_handoff_mission(
        db_session, criteria
    )

    assert permission == "Collect"

    # DB検証
    result = await db_session.execute(
        select(Mission).where(Mission.mission_id == mission_id)
    )
    mission = result.scalar_one()
    assert mission.permission == "Collect"
    assert mission.status == MissionStatus.ACTIVE.value

    # MissionReport が作成されていないことの確認
    mr_result = await db_session.execute(
        select(MissionReport).where(MissionReport.mission_id == mission_id)
    )
    assert len(mr_result.scalars().all()) == 0


@pytest.mark.asyncio
async def test_create_handoff_mission_view_with_reports(db_session):
    """正常系: 閲覧(View)モード、レポート指定あり"""
    id1, id2 = await _setup_reports(db_session)
    criteria = ExportRequest(target_report_ids=[id1, id2], permission="View")
    mission_id, _, _, _ = await create_handoff_mission(db_session, criteria)

    # MissionReport が2件作成されていること
    mr_result = await db_session.execute(
        select(MissionReport).where(MissionReport.mission_id == mission_id)
    )
    mrs = mr_result.scalars().all()
    assert len(mrs) == 2
    report_ids = {str(mr.report_id) for mr in mrs}
    assert str(id1) in report_ids
    assert str(id2) in report_ids


@pytest.mark.asyncio
async def test_create_handoff_mission_edit_conflict(db_session):
    """異常系: 既に Active な Edit 任務があるレポートに対して Edit 任務を発行できない"""
    id1, _ = await _setup_reports(db_session)
    criteria = ExportRequest(target_report_ids=[id1], permission="Edit")

    # 1回目は成功
    await create_handoff_mission(db_session, criteria)

    # 2回目は 409 Conflict
    with pytest.raises(HTTPException) as exc:
        await create_handoff_mission(db_session, criteria)
    assert exc.value.status_code == 409
    assert "既にこのレポートに Edit 任務が発行されています" in exc.value.detail


@pytest.mark.asyncio
async def test_create_handoff_mission_copy_no_reports_error(db_session):
    """異常系: コピー(Copy)モードでレポート指定なしは 400 Error"""
    criteria = ExportRequest(target_report_ids=[], permission="Copy")
    with pytest.raises(HTTPException) as exc:
        await create_handoff_mission(db_session, criteria)
    assert exc.value.status_code == 400
    assert "対象レポートを1件以上指定してください" in exc.value.detail


@pytest.mark.asyncio
async def test_export_request_invalid_permission_raises_error():
    """異常系: スキーマ定義外の権限名は Pydantic のバリデーションエラーになる"""
    with pytest.raises(ValidationError):
        ExportRequest(
            permission="SuperAdmin"  # Invalid
        )

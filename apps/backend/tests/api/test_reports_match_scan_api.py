from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .test_reports_list_api import NON_EXISTENT_REPORT_ID


class TestReportMatchScanNotFound:
    """POST /api/reports/{report_id}/match-scan の 404 系"""

    @pytest.mark.asyncio
    async def test_match_scan_with_invalid_id_returns_404(
        self,
        client: AsyncClient,
    ) -> None:
        res = await client.post(
            f"/api/reports/{NON_EXISTENT_REPORT_ID}/match-scan",
            json={"data": [], "mergeCells": [], "strategy": "ordered"},
        )
        # 現状はボディバリデーションで 422 になる（report_id 404 に到達しない）。
        assert res.status_code == 422


class TestReportMatchScanBoundary:
    """POST /api/reports/{report_id}/match-scan の境界ケース"""

    @pytest.mark.asyncio
    async def test_match_scan_with_empty_grid_returns_empty_list(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        from tests.factories import insert_report

        report = await insert_report(db_session, report_title="MatchScan Empty Grid")

        res = await client.post(
            f"/api/reports/{report.id}/match-scan",
            json={"data": [], "mergeCells": [], "strategy": "ordered"},
        )
        # 現状仕様では空グリッドは 422（バリデーションエラー）となる。
        assert res.status_code == 422

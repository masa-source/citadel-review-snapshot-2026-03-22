"""
ReportFormat / ReportFormatTemplate の API テスト。

対象:
- routers/report_formats.py
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ReportFormat, ReportFormatTemplate, ReportTemplate

NOT_FOUND_UUID = "00000000-0000-0000-0000-000000000000"


class TestReportFormatsList:
    @pytest.mark.asyncio
    async def test_get_report_formats_when_empty_returns_200_and_empty_list(
        self,
        client: AsyncClient,
    ) -> None:
        res = await client.get("/api/report-formats")
        assert res.status_code == 200
        assert res.json() == []


class TestReportFormatsCrud:
    @pytest.mark.asyncio
    async def test_post_report_formats_with_name_returns_200_and_persists(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        res = await client.post("/api/report-formats", json={"name": "作業報告書"})
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["name"] == "作業報告書"
        created_id = body["id"]

        row = await db_session.execute(
            select(ReportFormat).where(ReportFormat.id == uuid.UUID(created_id))
        )
        fmt = row.scalar_one_or_none()
        assert fmt is not None
        assert fmt.name == "作業報告書"

    @pytest.mark.asyncio
    async def test_post_report_formats_without_name_creates_empty_name(
        self,
        client: AsyncClient,
    ) -> None:
        res = await client.post("/api/report-formats", json={})
        assert res.status_code == 422, res.text

    @pytest.mark.asyncio
    async def test_post_report_formats_with_blank_name_returns_422(
        self,
        client: AsyncClient,
    ) -> None:
        res = await client.post("/api/report-formats", json={"name": "   "})
        assert res.status_code == 422, res.text

    @pytest.mark.asyncio
    async def test_put_report_formats_with_unknown_id_returns_404(
        self,
        client: AsyncClient,
    ) -> None:
        res = await client.put(
            f"/api/report-formats/{NOT_FOUND_UUID}",
            json={"name": "x"},
        )
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_put_report_formats_without_name_keeps_existing(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="A")
        db_session.add(fmt)
        await db_session.commit()
        await db_session.refresh(fmt)

        res = await client.put(f"/api/report-formats/{fmt.id}", json={})
        assert res.status_code == 200, res.text
        assert res.json()["name"] == "A"

    @pytest.mark.asyncio
    async def test_delete_report_formats_with_unknown_id_returns_404(
        self,
        client: AsyncClient,
    ) -> None:
        res = await client.delete(f"/api/report-formats/{NOT_FOUND_UUID}")
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_report_formats_deletes_links_too(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="F")
        t1 = ReportTemplate(name="T1", file_path="templates/t1.xlsx")
        t2 = ReportTemplate(name="T2", file_path="templates/t2.xlsx")
        db_session.add_all([fmt, t1, t2])
        await db_session.commit()
        await db_session.refresh(fmt)
        await db_session.refresh(t1)
        await db_session.refresh(t2)

        l1 = ReportFormatTemplate(
            report_format_id=fmt.id, report_template_id=t1.id, sort_order=1
        )
        l2 = ReportFormatTemplate(
            report_format_id=fmt.id, report_template_id=t2.id, sort_order=2
        )
        db_session.add_all([l1, l2])
        await db_session.commit()

        res = await client.delete(f"/api/report-formats/{fmt.id}")
        assert res.status_code == 200, res.text

        fmt_row = await db_session.execute(
            select(ReportFormat).where(ReportFormat.id == fmt.id)
        )
        assert fmt_row.scalar_one_or_none() is None

        links_row = await db_session.execute(
            select(ReportFormatTemplate).where(
                ReportFormatTemplate.report_format_id == fmt.id
            )
        )
        assert links_row.scalars().all() == []


class TestReportFormatTemplates:
    @pytest.mark.asyncio
    async def test_get_format_templates_with_unknown_id_returns_404(
        self,
        client: AsyncClient,
    ) -> None:
        res = await client.get(f"/api/report-formats/{NOT_FOUND_UUID}/templates")
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_get_format_templates_when_empty_returns_200_and_empty_list(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="F")
        db_session.add(fmt)
        await db_session.commit()
        await db_session.refresh(fmt)

        res = await client.get(f"/api/report-formats/{fmt.id}/templates")
        assert res.status_code == 200, res.text
        assert res.json() == []

    @pytest.mark.asyncio
    async def test_get_format_templates_returns_sorted_by_sort_order(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="F")
        t1 = ReportTemplate(name="T1", file_path="templates/t1.xlsx")
        t2 = ReportTemplate(name="T2", file_path="templates/t2.xlsx")
        t3 = ReportTemplate(name="T3", file_path="templates/t3.xlsx")
        db_session.add_all([fmt, t1, t2, t3])
        await db_session.commit()
        await db_session.refresh(fmt)
        await db_session.refresh(t1)
        await db_session.refresh(t2)
        await db_session.refresh(t3)

        db_session.add_all(
            [
                ReportFormatTemplate(
                    report_format_id=fmt.id, report_template_id=t1.id, sort_order=2
                ),
                ReportFormatTemplate(
                    report_format_id=fmt.id, report_template_id=t2.id, sort_order=1
                ),
                ReportFormatTemplate(
                    report_format_id=fmt.id, report_template_id=t3.id, sort_order=3
                ),
            ]
        )
        await db_session.commit()

        res = await client.get(f"/api/report-formats/{fmt.id}/templates")
        assert res.status_code == 200, res.text
        body = res.json()
        assert [row["sortOrder"] for row in body] == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_put_format_templates_with_unknown_id_returns_404(
        self,
        client: AsyncClient,
    ) -> None:
        res = await client.put(
            f"/api/report-formats/{NOT_FOUND_UUID}/templates", json={"items": []}
        )
        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_put_format_templates_with_empty_items_deletes_all_links(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="F")
        t = ReportTemplate(name="T", file_path="templates/t.xlsx")
        db_session.add_all([fmt, t])
        await db_session.commit()
        await db_session.refresh(fmt)
        await db_session.refresh(t)

        db_session.add(
            ReportFormatTemplate(
                report_format_id=fmt.id, report_template_id=t.id, sort_order=1
            )
        )
        await db_session.commit()

        res = await client.put(
            f"/api/report-formats/{fmt.id}/templates", json={"items": []}
        )
        assert res.status_code == 200, res.text

        links_row = await db_session.execute(
            select(ReportFormatTemplate).where(
                ReportFormatTemplate.report_format_id == fmt.id
            )
        )
        assert links_row.scalars().all() == []

    @pytest.mark.asyncio
    async def test_put_format_templates_replaces_existing_links(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="F")
        t1 = ReportTemplate(name="T1", file_path="templates/t1.xlsx")
        t2 = ReportTemplate(name="T2", file_path="templates/t2.xlsx")
        db_session.add_all([fmt, t1, t2])
        await db_session.commit()
        await db_session.refresh(fmt)
        await db_session.refresh(t1)
        await db_session.refresh(t2)

        db_session.add(
            ReportFormatTemplate(
                report_format_id=fmt.id, report_template_id=t1.id, sort_order=1
            )
        )
        await db_session.commit()

        payload = {
            "items": [
                {"templateId": str(t2.id), "sortOrder": 10},
                {"templateId": str(t1.id), "sortOrder": 20},
            ]
        }
        res = await client.put(f"/api/report-formats/{fmt.id}/templates", json=payload)
        assert res.status_code == 200, res.text

        links_row = await db_session.execute(
            select(ReportFormatTemplate).where(
                ReportFormatTemplate.report_format_id == fmt.id
            )
        )
        links = links_row.scalars().all()
        assert len(links) == 2
        assert {(link.report_template_id, link.sort_order) for link in links} == {
            (t2.id, 10),
            (t1.id, 20),
        }

    @pytest.mark.asyncio
    async def test_put_format_templates_with_nonexistent_template_id_can_return_500(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="F")
        db_session.add(fmt)
        await db_session.commit()
        await db_session.refresh(fmt)

        payload = {
            "items": [
                {"templateId": str(uuid.uuid4()), "sortOrder": 1},
            ]
        }
        res = await client.put(f"/api/report-formats/{fmt.id}/templates", json=payload)
        assert res.status_code == 400, res.text
        detail = res.json().get("detail")
        assert detail is not None
        assert "missingTemplateIds" in detail
        assert len(detail["missingTemplateIds"]) == 1


class TestReportFormatValidation:
    @pytest.mark.asyncio
    async def test_put_format_templates_with_invalid_uuid_in_path_returns_422(
        self,
        client: AsyncClient,
    ) -> None:
        res = await client.put(
            "/api/report-formats/not-a-uuid/templates", json={"items": []}
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_put_format_templates_with_invalid_uuid_in_body_returns_422(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="F")
        db_session.add(fmt)
        await db_session.commit()
        await db_session.refresh(fmt)

        payload = {"items": [{"templateId": "not-a-uuid", "sortOrder": 1}]}
        res = await client.put(f"/api/report-formats/{fmt.id}/templates", json=payload)
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_put_format_templates_with_invalid_sort_order_type_returns_422(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="F")
        t = ReportTemplate(name="T", file_path="templates/t.xlsx")
        db_session.add_all([fmt, t])
        await db_session.commit()
        await db_session.refresh(fmt)
        await db_session.refresh(t)

        payload = {"items": [{"templateId": str(t.id), "sortOrder": "x"}]}
        res = await client.put(f"/api/report-formats/{fmt.id}/templates", json=payload)
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_put_format_templates_with_negative_sort_order_returns_422(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="F")
        t = ReportTemplate(name="T", file_path="templates/t.xlsx")
        db_session.add_all([fmt, t])
        await db_session.commit()
        await db_session.refresh(fmt)
        await db_session.refresh(t)

        payload = {"items": [{"templateId": str(t.id), "sortOrder": -1}]}
        res = await client.put(f"/api/report-formats/{fmt.id}/templates", json=payload)
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_put_format_templates_with_duplicate_sort_order_returns_422(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="F")
        t1 = ReportTemplate(name="T1", file_path="templates/t1.xlsx")
        t2 = ReportTemplate(name="T2", file_path="templates/t2.xlsx")
        db_session.add_all([fmt, t1, t2])
        await db_session.commit()
        await db_session.refresh(fmt)
        await db_session.refresh(t1)
        await db_session.refresh(t2)

        payload = {
            "items": [
                {"templateId": str(t1.id), "sortOrder": 1},
                {"templateId": str(t2.id), "sortOrder": 1},
            ]
        }
        res = await client.put(f"/api/report-formats/{fmt.id}/templates", json=payload)
        assert res.status_code == 422

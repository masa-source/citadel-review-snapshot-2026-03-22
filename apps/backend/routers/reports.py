"""レポート API ルーター（一覧・削除・PDF/Excel 生成・コンテキスト取得）。"""

import logging
import re
import tempfile
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from database import get_session
from models import (
    Report,
    ReportFormat,
    ReportFormatTemplate,
    ReportTemplate,
)
from schemas import (
    MatchItemSchema,
    MatchScanRequest,
    ReportListItem,
)
from services.binder import generate_report_excel_zip, generate_report_pdf
from services.context_models import ReportContextRoot
from services.db_loader import LoadScope, load_report_context
from services.report_api_service import delete_report_cascade
from services.report_api_service import list_reports as service_list_reports
from services.template_safety import verify_template_safety
from utils.file_utils import remove_file
from utils.paths import get_assets_base
from utils.placeholder_matching import run_match_scan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["reports"])

# レポート種別に一致する ReportFormat が無いときの 404 メッセージ
FORMAT_NOT_FOUND_MSG = (
    "レポート種別『{report_type}』に対応するフォーマット定義が見つかりません。"
    "管理画面で設定を確認してください。"
)


async def _templates_for_report_format(
    session: AsyncSession, report: Report
) -> tuple[list[tuple[int, ReportTemplate]], str]:
    """
    Report に紐づく ReportFormat を解決し、
    中継テーブル経由で sort_order 順のテンプレート部品リストを返す。

    戻り値:
        ([(sort_order, ReportTemplate)], 表示用のレポート種別名)

    現在は Report.report_format_id でのみ解決する（legacy な report_type 文字列は既に廃止済み）。
    """
    fmt: ReportFormat | None = None
    report_type_label = "作業報告書"

    # 1. report_format_id 優先
    if getattr(report, "report_format_id", None):
        result = await session.execute(
            select(ReportFormat).where(ReportFormat.id == report.report_format_id)
        )
        fmt = result.scalars().first()
        if fmt and fmt.name:
            report_type_label = fmt.name

    if fmt is None:
        logger.warning(
            "ReportFormat not found for report_id=%s, report_format_id=%s",
            getattr(report, "id", None),
            getattr(report, "report_format_id", None),
        )
        raise HTTPException(
            status_code=404,
            detail=FORMAT_NOT_FOUND_MSG.format(report_type=report_type_label),
        )

    links_result = await session.execute(
        select(ReportFormatTemplate, ReportTemplate)
        .join(
            ReportTemplate,
            ReportTemplate.id == ReportFormatTemplate.report_template_id,
        )
        .where(ReportFormatTemplate.report_format_id == fmt.id)
        .order_by(asc(ReportFormatTemplate.sort_order))
    )
    templates_with_order = [(rft.sort_order, t) for rft, t in links_result.all()]
    return templates_with_order, report_type_label


@router.get("/reports", response_model=list[ReportListItem])
async def get_reports(
    session: AsyncSession = Depends(get_session),
):
    """レポート一覧を取得。会社名を JOIN して返す。作成日の降順でソート。"""
    rows = await service_list_reports(session)
    return [ReportListItem(**r) for r in rows]


async def _load_report_dict(
    session: AsyncSession,
    report,
    report_id: UUID,
    mode: str = "python",
) -> dict:
    """レポートのコンテキストデータを返す。
    report_snapshot があればそれを使用し、なければ DB から必要なデータを読み込む。
    """
    if getattr(report, "report_snapshot", None):
        return report.report_snapshot
    report_ctx = await load_report_context(session, report_id)
    if not report_ctx:
        raise HTTPException(
            status_code=404,
            detail=f"report_id={report_id} のレポートデータが見つかりません。",
        )
    return report_ctx.model_dump(by_alias=True, mode=mode)


@router.delete("/reports/{report_id}")
async def delete_report(
    report_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """指定IDのレポートを削除。関連データを子から親の順でカスケード削除する。"""
    ok = await delete_report_cascade(session, report_id)
    if not ok:
        raise HTTPException(status_code=404, detail="レポートが見つかりません。")
    return {"ok": True}


@router.post("/reports/{report_id}/complete")
async def complete_report(
    report_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """
    レポートを「完了」にする。完了時点のコンテキストを report_snapshot に保存する。
    以降の PDF/Excel 出力ではスナップショットを使用するため、マスタ変更の影響を受けない。
    """
    result = await session.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="レポートが見つかりません。")
    report_ctx = await load_report_context(session, report_id, LoadScope.FULL)
    if not report_ctx:
        raise HTTPException(
            status_code=404,
            detail="レポートデータの読み込みに失敗しました。",
        )
    report.report_snapshot = report_ctx.model_dump(by_alias=True, mode="json")
    session.add(report)
    await session.commit()
    return {"ok": True, "message": "レポートを完了し、スナップショットを保存しました。"}


@router.post("/generate-report")
async def generate_report(
    report_id: UUID = Query(..., description="出力対象のレポート ID"),
    use_printer: bool = Query(
        False,
        description="True の場合、Microsoft Print to PDF で印刷して PDF 出力（高画質）",
    ),
    session: AsyncSession = Depends(get_session),
):
    """
    report_id を受け取り、DB から関連データを取得し、Report に紐づくレポート種別
    (ReportFormat) に応じた複数テンプレートを順に処理し、1 つの PDF に結合して返す。
    """
    try:
        result = await session.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        if not report:
            raise HTTPException(
                status_code=404,
                detail=f"report_id={report_id} のレポートが見つかりません。",
            )
        templates_with_order, report_type_label = await _templates_for_report_format(
            session, report
        )
        if not templates_with_order:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"レポート種別『{report_type_label}』に対応するテンプレートが 1 件も登録されていません。"
                    "管理画面でレポート種別の構成を設定してください。"
                ),
            )

        base = get_assets_base()
        template_like_list = []
        for sort_order, t in templates_with_order:
            if not t.file_path:
                continue
            full_path = (base / t.file_path).resolve()
            if not full_path.is_file():
                raise HTTPException(
                    status_code=404,
                    detail=f"テンプレートファイルが見つかりません: {t.file_path}",
                )
            await verify_template_safety(full_path, t, session)
            template_like_list.append(
                SimpleNamespace(
                    sort_order=sort_order, file_path=t.file_path, name=t.name
                )
            )

        context = await _load_report_dict(session, report, report_id)

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            pdf_path = Path(tmp.name)
        try:
            generate_report_pdf(
                template_like_list,
                pdf_path,
                context,
                base,
                keep_excel=False,
                use_printer=use_printer,
            )
            title = (report.report_title or context.get("reportTitle") or "").strip()
            safe_name = (
                re.sub(r'[\\/:*?"<>|\r\n]+', "_", title)[:100].strip("_")
                if title
                else "report"
            )
            if not safe_name:
                safe_name = "report"
            pdf_filename = f"{safe_name}.pdf"
            return FileResponse(
                path=str(pdf_path),
                media_type="application/pdf",
                filename=pdf_filename,
                background=BackgroundTask(remove_file, pdf_path),
            )
        except Exception as e:
            if pdf_path.exists():
                pdf_path.unlink(missing_ok=True)
            logger.exception("PDF 生成に失敗しました: %s", e)
            raise HTTPException(
                status_code=500, detail=f"PDF 出力に失敗しました: {e!s}"
            ) from e
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("generate-report エラー: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/generate-excel")
async def generate_excel(
    report_id: UUID = Query(..., description="出力対象のレポート ID"),
    session: AsyncSession = Depends(get_session),
):
    """
    report_id を受け取り、DB から関連データを取得し、Report に紐づくレポート種別
    (ReportFormat) に応じた複数テンプレートを個別 Excel として処理し、ZIP 圧縮して返す。
    """
    try:
        result = await session.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        if not report:
            raise HTTPException(
                status_code=404,
                detail=f"report_id={report_id} のレポートが見つかりません。",
            )
        templates_with_order, report_type_label = await _templates_for_report_format(
            session, report
        )
        if not templates_with_order:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"レポート種別『{report_type_label}』に対応するテンプレートが 1 件も登録されていません。"
                    "管理画面でレポート種別の構成を設定してください。"
                ),
            )

        base = get_assets_base()
        template_like_list: list[SimpleNamespace] = []
        for sort_order, t in templates_with_order:
            if not t.file_path:
                continue
            full_path = (base / t.file_path).resolve()
            if not full_path.is_file():
                raise HTTPException(
                    status_code=404,
                    detail=f"テンプレートファイルが見つかりません: {t.file_path}",
                )
            await verify_template_safety(full_path, t, session)
            template_like_list.append(
                SimpleNamespace(
                    sort_order=sort_order, file_path=t.file_path, name=t.name
                )
            )

        context = await _load_report_dict(session, report, report_id)

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            zip_path = Path(tmp.name)
        try:
            generate_report_excel_zip(
                template_like_list,
                zip_path,
                context,
                base,
            )
            return FileResponse(
                path=str(zip_path),
                media_type="application/zip",
                filename="report.zip",
                background=BackgroundTask(remove_file, zip_path),
            )
        except Exception as e:
            if zip_path.exists():
                zip_path.unlink(missing_ok=True)
            logger.exception("Excel ZIP 生成に失敗しました: %s", e)
            raise HTTPException(
                status_code=500, detail=f"Excel ZIP 出力に失敗しました: {e!s}"
            ) from e
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("generate-excel エラー: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/reports/{report_id}/context", response_model=ReportContextRoot)
async def get_report_context(
    report_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> ReportContextRoot:
    """指定レポートIDのデータをロードし、レポートコンテキストをそのまま返す。プレースホルダ生成ツール用。"""
    report_ctx = await load_report_context(session, report_id)
    if not report_ctx:
        raise HTTPException(
            status_code=404,
            detail=f"report_id={report_id} のレポートデータが見つかりません。",
        )
    return report_ctx


@router.post("/reports/{report_id}/match-scan", response_model=list[MatchItemSchema])
async def run_report_match_scan(
    report_id: UUID,
    body: MatchScanRequest,
    session: AsyncSession = Depends(get_session),
) -> list[MatchItemSchema]:
    """指定レポートのコンテキストとシートのセル値から、自動マッチング候補を返す。"""

    report_ctx = await load_report_context(session, report_id)
    if not report_ctx:
        raise HTTPException(
            status_code=404,
            detail=f"report_id={report_id} のレポートデータが見つかりません。",
        )
    context_dict = report_ctx.model_dump(by_alias=True, mode="json")

    matches = run_match_scan(
        context_data=context_dict,
        grid_data=body.data,
        merge_cells=[
            {
                "row": m.row,
                "col": m.col,
                "rowspan": m.rowspan,
                "colspan": m.colspan,
            }
            for m in body.merge_cells or []
        ],
        strategy=body.strategy,
    )

    return [
        MatchItemSchema(
            row=m.row,
            col=m.col,
            currentValue=m.current_value,
            placeholder=m.placeholder,
        )
        for m in matches
    ]

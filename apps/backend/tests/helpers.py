"""
テスト用ヘルパー。fixture JSON の読み込みなど。
"""

from typing import Any

from sqlalchemy import select

from models import Report

# テスト用の共通UUID（各テストファイルから参照される定数）
UUID_COMPANY_1 = "11111111-1111-1111-1111-111111111111"
UUID_COMPANY_2 = "11111111-1111-1111-1111-111111111112"
UUID_WORKER_1 = "22222222-2222-2222-2222-222222222221"
UUID_INSTRUMENT_1 = "33333333-3333-3333-3333-333333333331"
UUID_OWNED_1 = "44444444-4444-4444-4444-444444444441"
UUID_PART_1 = "55555555-5555-5555-5555-555555555551"
UUID_SITE_1 = "66666666-6666-6666-6666-666666666661"
UUID_DEF_1 = "77777777-7777-7777-7777-777777777777"
UUID_REPORT_1 = "88888888-8888-8888-8888-888888888888"
UUID_REPORT_2 = "88888888-8888-8888-8888-888888888889"
UUID_REPORT_WORKER_1 = "88888888-8888-8888-8888-888888888871"
UUID_TARGET_1 = "88888888-8888-8888-8888-888888888881"
UUID_REPORT_OWNED_1 = "88888888-8888-8888-8888-888888888891"
UUID_USED_PART_1 = "88888888-8888-8888-8888-888888888801"
UUID_NON_EXISTENT = "00000000-0000-0000-0000-000000000000"


async def get_first_report_id(session):
    """データベース内の最初の ReportのIDを取得する"""
    result = await session.execute(select(Report))
    report = result.scalars().first()
    return report.id if report else None


def build_base_database_input(**kwargs) -> Any:
    """
    最低限のマスタデータ（会社、作業者、計器、部品、サイト、スキーマ定義）がセットされた
    DatabaseInput を構築する。factories.build_database_input のラッパー。
    """
    from tests.factories import build_database_input

    return build_database_input(**kwargs)

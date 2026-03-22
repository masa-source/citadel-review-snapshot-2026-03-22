"""
Citadel バックエンド（FastAPI + asyncpg）。
オフラインファースト現場報告管理システムのコアAPI。
起動時に PostgreSQL テーブルを自動作成し、初期データを登録する (lifespan)。
"""

import asyncio
import logging
import os
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlmodel import SQLModel

from auth import REQUIRE_API_KEY, VALID_API_KEYS, get_api_key_info
from database import async_session_maker, engine
from models import (  # noqa: F401 - テーブル登録のため import 必須
    Company,
    Instrument,
    OwnedInstrument,
    Part,
    Report,
    ReportClient,
    ReportFormat,
    ReportFormatTemplate,
    ReportOwnedInstrument,
    ReportTemplate,
    ReportWorker,
    SchemaDefinition,
    Site,
    TargetInstrument,
    UsedPart,
    Worker,
)
from routers import (
    demo,
    masters,
    missions,
    report_formats,
    reports,
    sync,
    templates,
)
from services.upload_session import cleanup_expired_upload_sessions
from utils.crud_router import make_crud_router
from utils.paths import (
    get_assets_base,
    get_assets_templates_dir,
    get_output_temp_dir,
    get_valid_template_paths,
)

# 初期化用: デフォルトのレポート種別名（ReportFormat.name / Report.report_format_id と対応させる）
DEFAULT_REPORT_FORMAT_NAME = "作業報告書"

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Sentry エラー監視の初期化
# -----------------------------------------------------------------------------
SENTRY_DSN = os.getenv("SENTRY_DSN_BACKEND")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        # 環境名
        environment=os.getenv("SENTRY_ENVIRONMENT", "development"),
        # サンプルレート（本番では調整推奨）
        traces_sample_rate=(
            0.1 if os.getenv("SENTRY_ENVIRONMENT") == "production" else 1.0
        ),
        # FastAPI 統合を有効化
        enable_tracing=True,
        # タグ設定
        _experiments={  # type: ignore[reportArgumentType]  # Sentry init の _experiments 引数型がスタブで未定義
            "profiles_sample_rate": 0.1,
        },
    )
    # 共通タグを設定
    sentry_sdk.set_tag("app", "backend")
    sentry_sdk.set_tag("framework", "fastapi")
    logger.info("Sentry initialized for backend")


def should_cleanup_item(item: Path, now: float, max_age_hours: int) -> bool:
    """削除すべきアイテムかどうかを判定する（Direct Handoff 用のディレクトリは除外）。"""
    if item.name == "staging" or item.name == "upload_sessions":
        return False
    try:
        mtime = item.stat().st_mtime
        age_hours = (now - mtime) / 3600
        return age_hours > max_age_hours
    except (OSError, FileNotFoundError):
        return False


def _cleanup_old_temp_files(max_age_hours: int = 24, now: float | None = None) -> None:
    """古い一時ファイルを削除する（起動時・定期バックグラウンドで実行）。"""
    output_temp = get_output_temp_dir()
    if not output_temp.exists():
        return

    if now is None:
        now = time.time()
    cleaned_count = 0

    for item in output_temp.iterdir():
        if should_cleanup_item(item, now, max_age_hours):
            try:
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
                cleaned_count += 1
                logger.info("Cleaned up old temp item: %s", item.name)
            except Exception as e:
                logger.warning("Failed to clean up %s: %s", item, e)

    # 有効期限切れのアップロードセッションを削除
    try:
        session_cleaned = cleanup_expired_upload_sessions(output_temp.parent)
        cleaned_count += session_cleaned
    except Exception as e:
        logger.warning("Upload sessions cleanup failed: %s", e)

    if cleaned_count > 0:
        logger.info("Temp cleanup: removed %d old items", cleaned_count)


# 定期クリーンアップの間隔（秒）。環境変数 TEMP_CLEANUP_INTERVAL_MINUTES で上書き可能（未設定時は 60 分）
def _temp_cleanup_interval_seconds() -> int:
    try:
        m = int(os.getenv("TEMP_CLEANUP_INTERVAL_MINUTES", "60").strip())
        return max(1, m) * 60
    except ValueError:
        return 60 * 60


async def _periodic_temp_cleanup() -> None:
    """一定間隔で output_temp 内の古い一時ファイルを削除する（ディスク肥大化防止）。"""
    interval = _temp_cleanup_interval_seconds()
    logger.info(
        "Temp cleanup: background task started (interval=%ds)",
        interval,
    )
    while True:
        await asyncio.sleep(interval)
        try:
            await asyncio.to_thread(_cleanup_old_temp_files, max_age_hours=24)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("Periodic temp cleanup failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """起動時に PostgreSQL にテーブルを作成し、ReportTemplate が空なら初期データを登録する。"""
    # 古い一時ファイルをクリーンアップ（24時間以上前のファイル）
    _cleanup_old_temp_files(max_age_hours=24)

    # 定期クリーンアップをバックグラウンドで開始（再起動なしでもディスク肥大化を防ぐ）
    cleanup_task = asyncio.create_task(_periodic_temp_cleanup())

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    logger.info("Database tables created (if not exists).")

    async with async_session_maker() as session:
        # テンプレート部品が 0 件ならディスクの .xlsx を ReportTemplate として登録（種別・順序は後で ReportFormat で紐づけ）
        result = await session.execute(select(ReportTemplate).limit(1))
        if result.scalar_one_or_none() is None:
            assets_base = get_assets_base()
            templates_dir = get_assets_templates_dir()
            if templates_dir.exists():
                rel_paths = get_valid_template_paths(assets_base, templates_dir.name)
                for rel_path in rel_paths:
                    rt = ReportTemplate(
                        name=Path(rel_path).stem,
                        file_path=rel_path,
                    )
                    session.add(rt)
                await session.commit()
                logger.info("ReportTemplate: %d 件を初期登録しました。", len(rel_paths))
            else:
                logger.warning(
                    "テンプレートディレクトリがありません: %s", templates_dir
                )

        # レポート種別が 0 件ならデフォルト「作業報告書」を作成し、既存の全テンプレート部品をその種別に紐づける
        fmt_result = await session.execute(select(ReportFormat).limit(1))
        if fmt_result.scalar_one_or_none() is None:
            default_fmt = ReportFormat(name=DEFAULT_REPORT_FORMAT_NAME)
            session.add(default_fmt)
            await session.flush()
            templates_result = await session.execute(
                select(ReportTemplate).order_by(ReportTemplate.name, ReportTemplate.id)  # type: ignore[reportArgumentType]  # SQLAlchemy order_by の引数型が pyright で未解決
            )
            for i, rt in enumerate(templates_result.scalars().all(), start=1):
                rft = ReportFormatTemplate(
                    report_format_id=default_fmt.id,
                    report_template_id=rt.id,
                    sort_order=i,
                )
                session.add(rft)
            await session.commit()
            logger.info(
                "ReportFormat「%s」とテンプレート構成を初期登録しました。",
                DEFAULT_REPORT_FORMAT_NAME,
            )

    try:
        # lifespan の本体処理（FastAPI に制御を戻す）
        yield
    finally:
        # アプリ終了時のクリーンアップ
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        await engine.dispose()


app = FastAPI(
    title="Citadel API",
    description="現場報告管理システム Citadel のバックエンド API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 設定: 環境変数 ALLOWED_ORIGINS で制限可能（カンマ区切り）
# allow_credentials=True のため "*" はブラウザで拒否される。明示的にオリジンを列挙する。
_DEFAULT_ORIGINS = "http://localhost:3000,http://localhost:3001"
_allowed_origins_env = os.getenv("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).strip()
ALLOWED_ORIGINS = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
if not ALLOWED_ORIGINS or (len(ALLOWED_ORIGINS) == 1 and ALLOWED_ORIGINS[0] == "*"):
    ALLOWED_ORIGINS = _DEFAULT_ORIGINS.split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# マスタ CRUD ルーターを動的に生成・登録
for config_kwargs in masters.MASTER_ROUTERS_CONFIG:
    router = make_crud_router(**config_kwargs)
    app.include_router(router, prefix="/api")

# その他の特殊なルーター
app.include_router(reports.router)
app.include_router(missions.router)
app.include_router(demo.router)
app.include_router(templates.router)
app.include_router(report_formats.router)
app.include_router(sync.router)


# -----------------------------------------------------------------------------
# APIキー認証ミドルウェア
# -----------------------------------------------------------------------------
@app.middleware("http")
async def api_key_middleware(request, call_next):
    """
    APIキー認証ミドルウェア。
    REQUIRE_API_KEY=true の場合、有効なAPIキーがないとリクエストを拒否する。
    """
    # 認証をスキップするパス
    skip_paths = ["/docs", "/openapi.json", "/redoc", "/"]
    if request.url.path in skip_paths:
        return await call_next(request)

    # APIキーを取得
    api_key = request.headers.get("X-API-Key")
    key_info = get_api_key_info(api_key)

    # 認証が必須の場合、APIキーを検証
    if REQUIRE_API_KEY and not key_info["authenticated"]:
        logger.warning(
            "Unauthorized API access: path=%s, ip=%s",
            request.url.path,
            request.client.host if request.client else "unknown",
        )
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or missing API key"},
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # リクエストにクライアント情報を付加（後続のエンドポイントで使用可能）
    request.state.client_info = key_info

    response = await call_next(request)
    return response


# 起動時にAPIキー認証の状態をログ出力
if REQUIRE_API_KEY:
    logger.info("API key authentication is ENABLED")
    if not VALID_API_KEYS:
        logger.warning("No valid API keys configured! All requests will be rejected.")
else:
    logger.info("API key authentication is DISABLED (development mode)")


# -----------------------------------------------------------------------------
# 最小クライアントバージョンチェック（PWA Version Skew 対策）
# -----------------------------------------------------------------------------
MIN_CLIENT_VERSION = os.getenv("MIN_CLIENT_VERSION", "").strip()


def _parse_version_triple(version: str) -> tuple[int, int, int]:
    """'1.2.3' や '1.0' を (1, 2, 3) にパース。不正時は (0, 0, 0)。"""
    if not version or not isinstance(version, str):
        return (0, 0, 0)
    parts = version.strip().split(".")[:3]
    try:
        return (
            int(parts[0]) if len(parts) > 0 else 0,
            int(parts[1]) if len(parts) > 1 else 0,
            int(parts[2]) if len(parts) > 2 else 0,
        )
    except (ValueError, TypeError):
        return (0, 0, 0)


def _is_client_version_below_min(client_version: str, min_version: str) -> bool:
    """クライアントバージョンが最小バージョン未満なら True。"""
    client = _parse_version_triple(client_version)
    min_v = _parse_version_triple(min_version)
    return client < min_v


@app.middleware("http")
async def client_version_middleware(request, call_next):
    """
    許容する最小フロントエンドバージョンをチェックする。
    MIN_CLIENT_VERSION が設定されている場合、X-Client-Version がそれ未満なら 426 を返し、
    再読み込みを促す（破壊的 API 変更時の PWA バージョンスキュー防止）。
    """
    skip_paths = ["/docs", "/openapi.json", "/redoc", "/"]
    if request.url.path in skip_paths or not MIN_CLIENT_VERSION:
        return await call_next(request)

    client_version = request.headers.get("X-Client-Version") or "0.0.0"
    if _is_client_version_below_min(client_version, MIN_CLIENT_VERSION):
        logger.warning(
            "Client version too old: path=%s, client=%s, min=%s",
            request.url.path,
            client_version,
            MIN_CLIENT_VERSION,
        )
        return JSONResponse(
            status_code=426,
            content={
                "detail": "クライアントのバージョンが古いため、ページを再読み込みしてください。",
                "code": "CLIENT_VERSION_TOO_OLD",
                "minVersion": MIN_CLIENT_VERSION,
            },
        )
    return await call_next(request)


if MIN_CLIENT_VERSION:
    logger.info("MIN_CLIENT_VERSION check is ENABLED: %s", MIN_CLIENT_VERSION)
else:
    logger.info("MIN_CLIENT_VERSION check is DISABLED (no env set)")

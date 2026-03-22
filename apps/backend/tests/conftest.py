"""
Pytest 共通フィクスチャ定義
プラグインシステムへ責務ごとに分割。
"""

import os
import sys

import pytest

# バックエンドルートをパスに追加
sys.path.insert(0, str(__file__).rsplit("tests", 1)[0])


def pytest_configure(config: pytest.Config) -> None:
    """カスタムマーカーを登録し、環境に応じたタイムアウトを設定"""
    # タイムアウト設定の動的調整 (pytest-timeout)
    # CI環境では厳しく (30秒)、ローカルでは余裕を持って (300秒) 設定
    is_ci = os.getenv("CI", "false").lower() == "true"
    default_timeout = 30 if is_ci else 300

    # pytest.ini の設定を上書き（または未設定時のデフォルトに）
    if hasattr(config.option, "timeout"):
        config.option.timeout = default_timeout

    config.addinivalue_line(
        "markers",
        "normal: 正常系テスト（期待する入力で 2xx または成功挙動を検証）",
    )
    config.addinivalue_line(
        "markers",
        "error: 異常系テスト（4xx/5xx、バリデーションエラー、NotFound 等を検証）",
    )
    config.addinivalue_line(
        "markers",
        "unit: 単体テスト（特定のモジュールや関数の挙動を検証）",
    )

    # xdist マスターノード（または単一プロセス）でのみ Testcontainers を1回だけ起動
    if not hasattr(config, "workerinput"):
        db_url = os.getenv("TEST_DATABASE_URL", "") or os.getenv("DATABASE_URL", "")
        if not db_url:
            from testcontainers.postgres import PostgresContainer

            postgres = PostgresContainer("postgres:15-alpine")
            postgres.start()
            os.environ["TEST_DATABASE_URL"] = postgres.get_connection_url()
            # 終了時に停止させるため保存
            config.postgres_container_instance = postgres


def pytest_unconfigure(config: pytest.Config) -> None:
    """テストセッション終了時に Testcontainers を停止"""
    postgres = getattr(config, "postgres_container_instance", None)
    if postgres:
        postgres.stop()

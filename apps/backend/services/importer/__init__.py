"""
db.json 形式の JSON を受け取り、PostgreSQL に整合性を保って保存する Importer.
Facade: 既存の import パスを維持するため run_import と _resolve を re-export。
"""

from ._utils import _resolve
from .run import run_import

__all__ = ["run_import", "_resolve"]

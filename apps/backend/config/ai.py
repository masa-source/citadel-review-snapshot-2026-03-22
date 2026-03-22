"""
AI抽出用設定（OpenAI互換API: LM Studio / vLLM 等）。
環境変数で上書き可能。未設定時はローカル開発用のデフォルトを使用する。
"""

import os

AI_API_BASE_URL = os.getenv("AI_API_BASE_URL", "http://localhost:1234/v1")
AI_MODEL_NAME = os.getenv("AI_MODEL_NAME", "qwen3.5")
AI_API_KEY = os.getenv("AI_API_KEY", "sk-local")

"""
ドメイン例外。サービス層で使用し、ルーターで HTTPException に変換する。
ユニットテストでは「サービスが NotFoundError を投げる」ことだけ検証しやすくなる。
"""


class NotFoundError(Exception):
    """指定されたリソースが存在しない場合にサービス層で投げる。"""

    def __init__(self, resource_name: str) -> None:
        self.resource_name = resource_name
        super().__init__(f"{resource_name} not found")

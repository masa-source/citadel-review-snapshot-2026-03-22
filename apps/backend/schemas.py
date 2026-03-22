"""
フロントエンドからの API 入力用 Pydantic スキーマ (db.json 形式, camelCase).
alias_generator で camelCase を受け付け、snake_case にマッピングする。
UUID を使用してクライアント側で ID 生成が可能。
"""

from typing import Any, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    create_model,
    field_validator,
    model_validator,
)

from config.validation import (
    MAX_CONTROL_NUMBER_LENGTH,
    MAX_REPORT_TITLE_LENGTH,
    MAX_TAG_NUMBER_LENGTH,
)
from models import (
    CompanyBase,
    InstrumentBase,
    OwnedInstrumentBase,
    PartBase,
    ReportBase,
    ReportClientBase,
    ReportOwnedInstrumentBase,
    ReportSiteBase,
    ReportWorkerBase,
    SchemaDefinitionBase,
    SiteBase,
    TableDefinitionBase,
    TargetInstrumentBase,
    TargetInstrumentTableBase,
    UsedPartBase,
    WorkerBase,
)
from utils.serialization import to_camel


def _base_config() -> ConfigDict:
    return ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


def normalize_custom_data_dict(v: Any) -> dict | None:
    """Parse, don't validate: dict ならそのまま、それ以外は {} に正規化する共通ヘルパー。"""
    if v is None:
        return None
    if isinstance(v, dict):
        return v
    return {}


def create_input_schema(base_cls: type[BaseModel]) -> type[BaseModel]:
    """Base クラスから UUID の id を持つ Input スキーマクラスを動的生成するファクトリ。"""
    name = base_cls.__name__.replace("Base", "") + "Input"
    return create_model(
        name,
        __base__=base_cls,
        __module__=__name__,
        id=(UUID | None, None),
        __config__=_base_config(),
    )


# --- マスタ系 (Input) ---

CompanyInput = create_input_schema(CompanyBase)
WorkerInput = create_input_schema(WorkerBase)
InstrumentInput = create_input_schema(InstrumentBase)
SchemaDefinitionInput = create_input_schema(SchemaDefinitionBase)
SiteInput = create_input_schema(SiteBase)
PartInput = create_input_schema(PartBase)
_OwnedInstrumentInputBase = create_input_schema(OwnedInstrumentBase)
TableDefinitionInput = create_input_schema(TableDefinitionBase)


class ReportFormatInput(BaseModel):
    """同期用レポート種別。id と name のみ。"""

    model_config = _base_config()
    id: UUID | None = None
    name: str | None = None


# --- トランザクション系 (Input) ---

_ReportInputBase = create_input_schema(ReportBase)


class ReportInput(_ReportInputBase):
    created_at: str | None = None
    custom_data: dict | None = None
    # ReportFormat 正規化後のレポート種別。db.json では reportFormatId として受け取り、Report.report_format_id にマッピングする。
    report_format_id: UUID | None = None

    @field_validator("custom_data", mode="before")
    @classmethod
    def normalize_custom_data(cls, v: Any) -> dict | None:
        return normalize_custom_data_dict(v)

    @field_validator("report_title")
    @classmethod
    def validate_report_title(cls, v: str | None) -> str | None:
        if v and len(v) > MAX_REPORT_TITLE_LENGTH:
            raise ValueError(
                f"件名は{MAX_REPORT_TITLE_LENGTH}文字以内で入力してください"
            )
        return v

    @field_validator("control_number")
    @classmethod
    def validate_control_number(cls, v: str | None) -> str | None:
        if v and len(v) > MAX_CONTROL_NUMBER_LENGTH:
            raise ValueError(
                f"管理番号は{MAX_CONTROL_NUMBER_LENGTH}文字以内で入力してください"
            )
        return v


ReportSiteInput = create_input_schema(ReportSiteBase)
ReportClientInput = create_input_schema(ReportClientBase)
ReportWorkerInput = create_input_schema(ReportWorkerBase)

_TargetInstrumentInputBase = create_input_schema(TargetInstrumentBase)


class TargetInstrumentInput(_TargetInstrumentInputBase):
    custom_data: dict | None = None

    @field_validator("custom_data", mode="before")
    @classmethod
    def normalize_custom_data(cls, v: Any) -> dict | None:
        return normalize_custom_data_dict(v)

    @field_validator("tag_number")
    @classmethod
    def validate_tag_number(cls, v: str | None) -> str | None:
        if v and len(v) > MAX_TAG_NUMBER_LENGTH:
            raise ValueError(
                f"管理番号（計器）は{MAX_TAG_NUMBER_LENGTH}文字以内で入力してください"
            )
        return v


class OwnedInstrumentInput(_OwnedInstrumentInputBase):
    @field_validator("cal_at", mode="before", check_fields=False)
    @classmethod
    def empty_str_to_none(cls, v):
        return None if v == "" else v


TargetInstrumentTableInput = create_input_schema(TargetInstrumentTableBase)
UsedPartInput = create_input_schema(UsedPartBase)
ReportOwnedInstrumentInput = create_input_schema(ReportOwnedInstrumentBase)


# --- ルート: db.json 形式 ---


class DatabaseInput(BaseModel):
    """フロントエンドから送信される db.json 互換のルート構造。"""

    model_config = _base_config()

    companies: list[CompanyInput] = Field(default_factory=list)
    workers: list[WorkerInput] = Field(default_factory=list)
    instruments: list[InstrumentInput] = Field(default_factory=list)
    schema_definitions: list[SchemaDefinitionInput] = Field(default_factory=list)
    sites: list[SiteInput] = Field(default_factory=list)
    parts: list[PartInput] = Field(default_factory=list)
    owned_instruments: list[OwnedInstrumentInput] = Field(default_factory=list)
    table_definitions: list[TableDefinitionInput] = Field(default_factory=list)
    report_formats: list[ReportFormatInput] = Field(default_factory=list)
    reports: list[ReportInput] = Field(default_factory=list)
    report_sites: list[ReportSiteInput] = Field(default_factory=list)
    report_clients: list[ReportClientInput] = Field(default_factory=list)
    report_workers: list[ReportWorkerInput] = Field(default_factory=list)
    target_instruments: list[TargetInstrumentInput] = Field(default_factory=list)
    target_instrument_tables: list[TargetInstrumentTableInput] = Field(
        default_factory=list
    )
    used_parts: list[UsedPartInput] = Field(default_factory=list)
    report_owned_instruments: list[ReportOwnedInstrumentInput] = Field(
        default_factory=list
    )
    # 同期・任務管理用のメタデータ（モデルには保存しない）
    mission: dict | None = Field(default=None, alias="_mission")


# --- レスポンス用スキーマ ---


class ReportListItem(BaseModel):
    """レポート一覧表示用の軽量モデル。"""

    model_config = _base_config()

    id: UUID
    report_title: str | None = None
    control_number: str | None = None
    created_at: str | None = None
    report_format_name: str | None = None
    company_name: str | None = None


# --- テンプレート管理用スキーマ ---


class TemplateUpdate(BaseModel):
    """テンプレート部品のメタデータ更新用スキーマ。種別・順序は ReportFormat 管理で行う。"""

    model_config = _base_config()

    name: str | None = None
    file_path: str | None = None

    @field_validator("file_path")
    @classmethod
    def validate_file_path(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if s == "":
            return s
        # 禁止: 絶対パス / ドライブレター / パストラバーサル
        if s.startswith(("/", "\\")):
            raise ValueError("filePath は相対パスで指定してください")
        if len(s) >= 2 and s[1] == ":":
            raise ValueError("filePath は相対パスで指定してください")
        if ".." in s.replace("\\", "/").split("/"):
            raise ValueError("filePath が不正です")
        return s


class GridCellChange(BaseModel):
    """簡易設計台：1セル分の変更。row/col は 0-based。"""

    model_config = _base_config()

    sheet_name: str
    row: int
    col: int
    value: str | int | float | None = None


class GridUpdateBody(BaseModel):
    """簡易設計台：差分データ。force_overwrite: 外部でファイルが変更されていても上書き保存する場合に True。
    use_excel_instance: True のとき Excel 本体(xlwings)で保存し画像・図形を保持。False のとき openpyxl で保存（デフォルト）。"""

    model_config = _base_config()

    changes: list[GridCellChange]
    force_overwrite: bool | None = None
    use_excel_instance: bool = False


class TemplateScanMissingItem(BaseModel):
    """スキャン結果：ディスクに存在しない DB レコード（行方不明）。"""

    model_config = _base_config()

    id: UUID
    file_path: str | None = None


class TemplateScanResult(BaseModel):
    """整合性スキャン結果。new_files は DB にないディスク上のファイル（相対パス）。"""

    model_config = _base_config()

    inconsistent: bool = False
    new_files: list[str] = Field(default_factory=list)
    missing_from_disk: list[TemplateScanMissingItem] = Field(default_factory=list)


class TemplateAutoGenerateTemplateItem(BaseModel):
    """自動生成 API レスポンスのテンプレート部。"""

    model_config = _base_config()

    id: UUID
    name: str
    file_path: str | None = None


class TemplateAutoGenerateReportItem(BaseModel):
    """自動生成 API レスポンスのレポート部。"""

    model_config = _base_config()

    id: UUID
    report_title: str = ""


class TemplateAutoGenerateResponse(BaseModel):
    """POST /api/templates/auto-generate のレスポンス。"""

    model_config = _base_config()

    template: TemplateAutoGenerateTemplateItem
    report: TemplateAutoGenerateReportItem


class TemplateSyncFileInput(BaseModel):
    """個別ファイル同期（インポート）のリクエスト。file_path は assets 基準の相対パス。"""

    model_config = _base_config()

    file_path: str


class TemplateRevalidateBody(BaseModel):
    """外部編集後の再検証。ファイルが見つからない場合に new_file_path で再試行できる。
    バックアップ失敗時にユーザーが「続行」を選んだ場合は force_continue=True で再送する。
    """

    model_config = _base_config()

    new_file_path: str | None = None
    force_continue: bool | None = None  # バックアップをスキップして検疫・DB更新のみ実行


# --- レポート種別（ReportFormat）管理用スキーマ ---


class ReportFormatCreate(BaseModel):
    """レポート種別の新規作成。"""

    model_config = _base_config()

    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if v.strip() == "":
            raise ValueError("name は必須です")
        return v


class ReportFormatUpdate(BaseModel):
    """レポート種別の更新。"""

    model_config = _base_config()

    name: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v.strip() == "":
            raise ValueError("name は空白のみ不可です")
        return v


class ReportFormatTemplateItem(BaseModel):
    """種別に紐づくテンプレート 1 件（構成の追加・一括更新用）。"""

    model_config = _base_config()

    template_id: UUID
    sort_order: int = Field(ge=0)


class ReportFormatTemplatesUpdate(BaseModel):
    """種別のテンプレート構成を一括更新。"""

    model_config = _base_config()

    items: list[ReportFormatTemplateItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_items(self) -> "ReportFormatTemplatesUpdate":
        sort_orders = [i.sort_order for i in self.items]
        if len(sort_orders) != len(set(sort_orders)):
            raise ValueError("sortOrder が重複しています")
        return self


# --- 会社マスタ管理用スキーマ ---


class CompanyCreate(CompanyInput):
    """会社の新規作成用スキーマ。"""

    model_config = _base_config()
    name: str = Field(...)


# --- 作業者マスタ管理用スキーマ ---


class WorkerCreate(WorkerInput):
    model_config = _base_config()
    name: str = Field(...)


# --- 計器マスタ管理用スキーマ ---


class InstrumentCreate(InstrumentInput):
    model_config = _base_config()
    name: str = Field(...)


# --- 部品マスタ管理用スキーマ ---


class PartCreate(PartInput):
    model_config = _base_config()
    name: str = Field(...)


# --- 所有計器マスタ管理用スキーマ ---


class OwnedInstrumentCreate(OwnedInstrumentInput):
    model_config = _base_config()


# --- TableDefinition CRUD 用スキーマ ---


class TableDefinitionCreate(TableDefinitionInput):
    model_config = _base_config()
    name: str = Field(...)


# --- SchemaDefinition / Site CRUD 用スキーマ ---


class SchemaDefinitionCreate(SchemaDefinitionInput):
    model_config = _base_config()
    target_entity: str
    version: str


class SiteCreate(SiteInput):
    model_config = _base_config()
    name: str


# --- 任務管理用スキーマ ---


class MissionHeartbeatRequest(BaseModel):
    """任務ハートビートリクエスト。"""

    model_config = _base_config()

    device_id: str


# --- カスタムエクスポート用スキーマ ---


class ExportRequest(BaseModel):
    """Scout へのカスタムデータエクスポート用リクエスト。"""

    model_config = _base_config()

    # マスタデータの選択
    include_companies: bool = True
    include_workers: bool = True
    include_instruments: bool = True
    include_schema_definitions: bool = True
    include_sites: bool = True
    include_parts: bool = True
    include_owned_instruments: bool = True
    include_table_definitions: bool = True
    include_report_formats: bool = True

    # 持ち出すレポートのIDリスト
    target_report_ids: list[UUID] = []

    # 任務権限（Citadel が発行時に決定）
    permission: Literal["Collect", "View", "Edit", "Copy"] = "Collect"

    # エクスポートモード
    # "edit": IDを維持（Scoutで編集して上書き保存用）
    # "copy": IDを削除（新規レポートの雛形用）
    export_mode: Literal["edit", "copy"] = "edit"


# --- プレースホルダ自動マッチング用スキーマ ---


class MergeCellRangeSchema(BaseModel):
    """簡易設計台の結合セル情報（0-based）。"""

    model_config = _base_config()

    row: int
    col: int
    rowspan: int
    colspan: int


class MatchItemSchema(BaseModel):
    """自動マッチング結果 1 件分。"""

    model_config = _base_config()

    row: int
    col: int
    current_value: str = Field(alias="currentValue")
    placeholder: str


class MatchScanRequest(BaseModel):
    """プレースホルダ自動マッチング要求。"""

    model_config = _base_config()

    sheet_name: str = Field(alias="sheetName")
    data: list[list[Any]]
    merge_cells: list[MergeCellRangeSchema] | None = Field(
        default=None, alias="mergeCells"
    )
    strategy: Literal["ordered", "key", "primary"] = "ordered"


# --- データ同期用スキーマ ---


class UploadBeginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    mode: Literal["copy", "overwrite"] = "copy"
    mission_meta: dict | None = Field(None, alias="_mission")


class UploadChunkRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    session_id: str = Field(alias="sessionId")
    sequence_index: int = Field(alias="sequenceIndex")
    table: str = ""
    rows: list = Field(default_factory=list)


class UploadCommitRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    session_id: str = Field(alias="sessionId")

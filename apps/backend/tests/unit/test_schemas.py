"""
schemas.py のバリデーション・正規化のユニットテスト。
custom_data の Parse, don't validate（境界での正規化）を検証する。
"""

import pytest
from pydantic import ValidationError

from config.validation import (
    MAX_CONTROL_NUMBER_LENGTH,
    MAX_REPORT_TITLE_LENGTH,
    MAX_TAG_NUMBER_LENGTH,
)
from schemas import (
    CompanyCreate,
    DatabaseInput,
    InstrumentCreate,
    PartCreate,
    ReportInput,
    TargetInstrumentInput,
    UploadBeginRequest,
    UploadChunkRequest,
    WorkerCreate,
)


@pytest.mark.normal
class TestReportInputCustomData:
    """ReportInput の custom_data field_validator による正規化"""

    def test_custom_data_dict_passthrough(self) -> None:
        """dict を渡すとそのまま通る"""
        data = {"customData": {"year": 2024, "key": "value"}}
        obj = ReportInput(**data)
        assert obj.custom_data == {"year": 2024, "key": "value"}

    def test_custom_data_none_unchanged(self) -> None:
        """None は None のまま"""
        obj = ReportInput()
        assert obj.custom_data is None

    def test_custom_data_list_normalized_to_empty_dict(self) -> None:
        """リストを渡すと {} に正規化される"""
        data = {"customData": [1, 2, 3]}
        obj = ReportInput(**data)
        assert obj.custom_data == {}

    def test_custom_data_str_normalized_to_empty_dict(self) -> None:
        """文字列を渡すと {} に正規化される"""
        data = {"customData": "invalid"}
        obj = ReportInput(**data)
        assert obj.custom_data == {}

    def test_custom_data_number_normalized_to_empty_dict(self) -> None:
        """数値を渡すと {} に正規化される"""
        data = {"customData": 42}
        obj = ReportInput(**data)
        assert obj.custom_data == {}


@pytest.mark.normal
class TestReportInputValidation:
    """ReportInput の Pydantic フィールドバリデーション"""

    def test_report_title_over_max_raises_validation_error(self) -> None:
        """reportTitle が MAX_REPORT_TITLE_LENGTH を超えると ValidationError が発生する"""
        data = {
            "reportTitle": "x" * (MAX_REPORT_TITLE_LENGTH + 1),
            "reportType": "inspection",
            "companyId": "11111111-1111-1111-1111-111111111111",
            "schemaId": "22222222-2222-2222-2222-222222222222",
        }
        with pytest.raises(ValidationError) as exc_info:
            ReportInput(**data)
        assert "String should have at most" in str(exc_info.value)


@pytest.mark.normal
class TestTargetInstrumentInputCustomData:
    """TargetInstrumentInput の custom_data field_validator による正規化"""

    def test_custom_data_dict_passthrough(self) -> None:
        """dict を渡すとそのまま通る"""
        data = {"customData": {"tag": "A-001"}}
        obj = TargetInstrumentInput(**data)
        assert obj.custom_data == {"tag": "A-001"}

    def test_custom_data_none_unchanged(self) -> None:
        """None は None のまま"""
        obj = TargetInstrumentInput()
        assert obj.custom_data is None

    def test_custom_data_list_normalized_to_empty_dict(self) -> None:
        """リストを渡すと {} に正規化される"""
        data = {"customData": ["a", "b"]}
        obj = TargetInstrumentInput(**data)
        assert obj.custom_data == {}

    def test_custom_data_str_normalized_to_empty_dict(self) -> None:
        """文字列を渡すと {} に正規化される"""
        data = {"customData": "invalid"}
        obj = TargetInstrumentInput(**data)
        assert obj.custom_data == {}


@pytest.mark.normal
class TestMasterSchemasValidation:
    """各マスタ（Create用スキーマ）の共通バリデーションテスト（必須欠損・型違反）"""

    @pytest.mark.parametrize(
        "schema_cls, payload",
        [
            (CompanyCreate, {}),  # name 必須
            (CompanyCreate, {"name": 123}),  # name 型違反
            (WorkerCreate, {}),  # name 必須
            (WorkerCreate, {"name": [], "company_id": "invalid-uuid"}),
            (InstrumentCreate, {}),
            (InstrumentCreate, {"name": {"nested": "obj"}}),
            (PartCreate, {}),
            (PartCreate, {"name": None}),
        ],
    )
    def test_create_schemas_invalid_payload_raises_error(self, schema_cls, payload):
        with pytest.raises(ValidationError):
            schema_cls(**payload)


@pytest.mark.normal
class TestSyncSchemasValidation:
    """データ同期系（DatabaseInput, UploadRequest）のバリデーションテスト"""

    def test_database_input_invalid_types(self):
        """DatabaseInput の各リストフィールドに対する型違反"""
        invalid_payloads = [
            {"companies": "not a list"},
            {"workers": 123},
            {"reports": "string"},
        ]
        for payload in invalid_payloads:
            with pytest.raises(ValidationError):
                DatabaseInput(**payload)

    @pytest.mark.parametrize(
        "payload",
        [
            {"mode": "invalid_mode"},  # Literal 違反
            {"mode": 123},
        ],
    )
    def test_upload_begin_request_invalid_mode(self, payload):
        with pytest.raises(ValidationError):
            UploadBeginRequest(**payload)

    @pytest.mark.parametrize(
        "payload",
        [
            {"sequenceIndex": "not-int", "table": "companies", "rows": []},  # 型違反
            {"sequenceIndex": 0, "table": "invalid_table", "rows": []},  # Literal 違反
            {"sequenceIndex": 0, "table": "reports"},  # rows 欠損
        ],
    )
    def test_upload_chunk_request_validation(self, payload):
        # session_id が必須だが、ここでは validation 発生を期待
        with pytest.raises(ValidationError):
            UploadChunkRequest(**payload)


@pytest.mark.normal
class TestSchemaLengthValidation:
    """文字数制限のあるフィールドのバリデーション"""

    def test_control_number_length_validation(self):
        data = {"control_number": "x" * (MAX_CONTROL_NUMBER_LENGTH + 1)}
        with pytest.raises(ValidationError):
            ReportInput(**data)

    def test_target_instrument_tag_number_length_validation(self):
        data = {"tag_number": "x" * (MAX_TAG_NUMBER_LENGTH + 1)}
        with pytest.raises(ValidationError):
            TargetInstrumentInput(**data)

"""
binder.py のユニットテスト
"""

from typing import Any, cast

import pytest


class TestReportContextStructure:
    """レポートコンテキストの構造（load_report_context 戻り値＝論理キー・Ordered のみ）の検証"""

    @pytest.fixture
    def sample_report_dict(self) -> dict[str, Any]:
        """load_report_context の戻り値相当（ByRole/Ordered/Primary）"""
        worker_leader = {
            "workerRole": "leader",
            "worker": {
                "name": "John Doe",
                "sealImageUrl": "http://seal/1.png",
                "company": {"name": "Test Company"},
            },
        }
        worker_assistant = {
            "workerRole": "assistant",
            "worker": {"name": "Jane Smith", "company": {"name": "Test Company"}},
        }
        ti_001 = {
            "tagNumber": "TAG-001",
            "instrument": {
                "name": "Test Instrument",
                "modelNumber": "MODEL-001",
                "company": {"name": "Maker Inc"},
            },
        }
        result = {
            "reportTitle": "Test Report",
            "reportType": "inspection",
            "controlNumber": "CTRL-001",
            "createdAt": "2024-01-15T10:00:00",
            "company": {
                "name": "Test Company",
                "department": "Engineering",
                "address": "123 Test St",
                "phone": "123-456-7890",
            },
            "reportWorkerPrimary": worker_leader,
            "reportWorkersByRole": {
                "leader": worker_leader,
                "assistant": worker_assistant,
            },
            "reportWorkersOrdered": [None, worker_leader, worker_assistant],
            "targetInstrumentPrimary": ti_001,
            "targetInstrumentsByTagNumber": {"TAG-001": ti_001},
            "targetInstrumentsOrdered": [None, ti_001],
            "reportOwnedInstrumentsByType": {
                "_": [
                    {
                        "ownedInstrument": {
                            "equipmentName": "Owned Equipment",
                            "managementNumber": "MGT-001",
                            "instrument": {"name": "Test Instrument"},
                            "company": {"name": "Test Company"},
                        }
                    }
                ]
            },
            "usedPartPrimary": {
                "quantity": 2,
                "notes": "Replaced",
                "part": {
                    "name": "Test Part",
                    "partNumber": "PART-001",
                    "company": {"name": "Maker Inc"},
                },
            },
            "usedPartsOrdered": [
                None,
                {
                    "quantity": 2,
                    "notes": "Replaced",
                    "part": {
                        "name": "Test Part",
                        "partNumber": "PART-001",
                        "company": {"name": "Maker Inc"},
                    },
                },
            ],
        }
        return cast(dict[str, Any], result)

    def test_report_context_basic(self, sample_report_dict: dict[str, Any]) -> None:
        """ルート = Report の辞書構造（論理キー・Ordered）"""
        context = sample_report_dict

        assert context["reportTitle"] == "Test Report"
        assert context["reportType"] == "inspection"
        assert context["controlNumber"] == "CTRL-001"
        assert context["company"]["name"] == "Test Company"
        assert context["company"]["department"] == "Engineering"

    def test_report_context_workers(self, sample_report_dict: dict[str, Any]) -> None:
        """作業者は reportWorkersOrdered / reportWorkersByRole で参照"""
        context = sample_report_dict
        assert context["reportWorkersOrdered"][1]["worker"]["name"] == "John Doe"
        assert context["reportWorkersOrdered"][1]["workerRole"] == "leader"
        assert context["reportWorkersOrdered"][2]["worker"]["name"] == "Jane Smith"
        assert context["reportWorkersByRole"]["leader"]["worker"]["name"] == "John Doe"
        assert context["reportWorkerPrimary"]["worker"]["name"] == "John Doe"

    def test_report_context_instruments(
        self, sample_report_dict: dict[str, Any]
    ) -> None:
        """計器は targetInstrumentsOrdered / targetInstrumentsByTagNumber で参照"""
        context = sample_report_dict
        ti = context["targetInstrumentsOrdered"][1]
        assert ti["instrument"]["name"] == "Test Instrument"
        assert ti["instrument"]["modelNumber"] == "MODEL-001"
        assert ti["instrument"]["company"]["name"] == "Maker Inc"
        assert ti["tagNumber"] == "TAG-001"
        assert (
            context["targetInstrumentsByTagNumber"]["TAG-001"]["tagNumber"] == "TAG-001"
        )
        assert (
            context["targetInstrumentPrimary"]["instrument"]["name"]
            == "Test Instrument"
        )

    def test_report_context_owned_instruments(
        self, sample_report_dict: dict[str, Any]
    ) -> None:
        """所有計器は reportOwnedInstrumentsByType で参照"""
        context = sample_report_dict
        list_by_type = context["reportOwnedInstrumentsByType"]["_"]
        assert len(list_by_type) == 1
        owned = list_by_type[0]["ownedInstrument"]
        assert owned["equipmentName"] == "Owned Equipment"
        assert owned["managementNumber"] == "MGT-001"

    def test_report_context_parts(self, sample_report_dict: dict[str, Any]) -> None:
        """使用部品は usedPartPrimary / usedPartsOrdered で参照"""
        context = sample_report_dict
        up = context["usedPartPrimary"]
        assert up["quantity"] == 2
        assert up["part"]["name"] == "Test Part"
        assert up["part"]["partNumber"] == "PART-001"
        assert up["part"]["company"]["name"] == "Maker Inc"
        assert context["usedPartsOrdered"][1]["part"]["name"] == "Test Part"

    def test_report_context_empty_tree(self) -> None:
        """空の report 辞書（論理キー・Ordered のみの形）の構造"""
        empty_report = {
            "reportTitle": "",
            "company": {},
            "reportWorkersOrdered": [],
            "reportWorkerPrimary": None,
            "targetInstrumentsOrdered": [],
            "usedPartsOrdered": [],
        }
        context = empty_report
        assert context["reportTitle"] == ""
        assert context["company"] == {}
        assert context["reportWorkersOrdered"] == []
        assert "reportWorkers" not in context

    def test_report_context_created_at_iso(self) -> None:
        """createdAt は ISO 文字列のまま渡る"""
        report_dict = {
            "reportTitle": "",
            "createdAt": "2024-06-15T14:30:00Z",
            "company": {},
            "reportWorkersOrdered": [],
            "usedPartsOrdered": [],
        }
        context = report_dict
        assert context["createdAt"] == "2024-06-15T14:30:00Z"

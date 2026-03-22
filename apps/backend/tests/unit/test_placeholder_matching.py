from utils import placeholder_matching as pm


class TestFlattenContextToPaths:
    def test_emits_ordered_paths_with_bracket_notation(self) -> None:
        context = {
            "reportWorkersByRole": {
                "監督": {"worker": {"name": "Alice"}},
                "作業者": {"worker": {"name": "Bob"}},
            },
            "reportWorkersOrdered": [
                None,
                {"worker": {"name": "Alice"}},
                {"worker": {"name": "Bob"}},
            ],
        }

        flat = pm.flatten_context_to_paths(context, "")

        paths = [item["path"] for item in flat]
        assert any("reportWorkersByRole.監督" in p for p in paths)
        assert any("reportWorkersOrdered[1]" in p for p in paths)
        assert any("reportWorkersOrdered[2]" in p for p in paths)

    def test_ignores_hidden_keys(self) -> None:
        context = {
            "id": "11111111-1111-1111-1111-111111111111",
            "companyId": "22222222-2222-2222-2222-222222222222",
            "createdAt": "2024-01-01",
            "name": "Test Company",
        }

        flat = pm.flatten_context_to_paths(context, "")
        paths = [item["path"] for item in flat]

        assert "name" in paths
        assert "id" not in paths
        assert "companyId" not in paths
        assert "createdAt" not in paths

    def test_expands_primitive_arrays(self) -> None:
        context = {"myList": ["a", "b", "c"]}

        flat = pm.flatten_context_to_paths(context, "")

        assert {"path": "myList[0]", "value": "a"} in flat
        assert {"path": "myList[1]", "value": "b"} in flat
        assert {"path": "myList[2]", "value": "c"} in flat

    def test_does_not_expand_object_arrays(self) -> None:
        context = {"items": [{"label": "A"}, {"label": "B"}]}

        flat = pm.flatten_context_to_paths(context, "")
        paths = [item["path"] for item in flat]

        assert "items[0].label" not in paths
        assert "items[1].label" not in paths

    def test_expands_rows_array_of_objects(self) -> None:
        context = {
            "targetInstrumentPrimary": {
                "tablesOrdered": [
                    None,
                    {"rows": [{"point": "P1"}, {"point": "P2"}]},
                ]
            }
        }

        flat = pm.flatten_context_to_paths(context, "")

        assert any(
            p.endswith(".rows[0].point") and v == "P1"
            for p, v in ((item["path"], item["value"]) for item in flat)
        )
        assert any(
            p.endswith(".rows[1].point") and v == "P2"
            for p, v in ((item["path"], item["value"]) for item in flat)
        )

    def test_does_not_expand_non_ordered_list_keys(self) -> None:
        context = {
            "usedPartsByCategory": {
                "seal": [
                    {"part": {"name": "Gasket A"}},
                    {"part": {"name": "Gasket B"}},
                ]
            }
        }

        flat = pm.flatten_context_to_paths(context, "")
        paths = [item["path"] for item in flat]

        assert "usedPartsByCategory.seal[0].part.name" not in paths
        assert "usedPartsByCategory.seal[1].part.name" not in paths


class TestBuildValueToPathMap:
    def test_prefers_ordered_over_raw_index_for_same_value(self) -> None:
        flat = [
            {"path": "reportWorkers[0].worker.name", "value": "Alice"},
            {"path": "reportWorkersOrdered[1].worker.name", "value": "Alice"},
            {"path": "reportWorkersByRole.監督.worker.name", "value": "Alice"},
        ]

        value_to_path = pm.build_value_to_path_map(flat)

        assert value_to_path.get("Alice") == "reportWorkersOrdered[1].worker.name"

    def test_ignores_value_when_only_raw_index_paths_exist(self) -> None:
        flat = [{"path": "reportWorkers[0].worker.name", "value": "OnlyIndex"}]

        value_to_path = pm.build_value_to_path_map(flat)

        assert "OnlyIndex" not in value_to_path


class TestIsExcludedCellValue:
    def test_returns_true_for_uuid_format_string(self) -> None:
        assert pm.is_excluded_cell_value("11111111-1111-1111-1111-111111111111")
        assert pm.is_excluded_cell_value("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        assert pm.is_excluded_cell_value("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")

    def test_returns_false_for_non_uuid_strings(self) -> None:
        assert not pm.is_excluded_cell_value("Alice")
        assert not pm.is_excluded_cell_value("TAG-001")

    def test_excludes_short_numeric_strings_and_special_match_values(self) -> None:
        assert pm.is_excluded_cell_value("1")
        assert pm.is_excluded_cell_value("12")
        assert pm.is_excluded_cell_value(" 1 ")
        assert pm.is_excluded_cell_value("なし")
        assert pm.is_excluded_cell_value(" ")
        assert pm.is_excluded_cell_value("")

    def test_excludes_existing_placeholder_pattern(self) -> None:
        assert pm.is_excluded_cell_value("{{ foo }}")
        assert pm.is_excluded_cell_value("  {{bar}}  ")


class TestChoosePath:
    def test_prefers_ordered_over_key_path_in_default_strategy(self) -> None:
        a = "reportWorkersOrdered[1].worker.name"
        b = "reportWorkersByRole.監督.worker.name"

        assert pm.choose_path(a, b) == a

    def test_strategy_key_prefers_key_path_over_ordered(self) -> None:
        a = "reportWorkersOrdered[1].worker.name"
        b = "reportWorkersByRole.監督.worker.name"

        assert pm.choose_path(a, b, strategy="key") == b

    def test_strategy_primary_prefers_shorter_primary_like_path(self) -> None:
        a = "reportWorkersOrdered[1].worker.name"
        b = "reportWorkerPrimary.worker.name"

        assert pm.choose_path(a, b, strategy="primary") == b

    def test_tie_breaker_prefers_shorter_path_when_scores_equal(self) -> None:
        a = "longer.path.example"
        b = "short.path"

        # 同じスコアの場合、短いパスが選ばれる
        assert pm.choose_path(a, b, strategy="ordered") == b


class TestPathClassification:
    def test_is_ordered_path_true_for_ordered_bracket_notation(self) -> None:
        assert pm.is_ordered_path("reportWorkersOrdered[1]")
        assert pm.is_ordered_path("targetInstrumentsOrdered[2]")

    def test_is_ordered_path_false_for_dot_notation_or_raw_index(self) -> None:
        assert not pm.is_ordered_path("reportWorkersOrdered.1")
        assert not pm.is_ordered_path("reportWorkers[0]")

    def test_is_key_path_matches_role_id_worker_and_tag_patterns(self) -> None:
        assert pm.is_key_path("reportWorkersByRole.監督.worker.name")
        assert pm.is_key_path("targetInstrumentsById['abc'].instrument.name")
        assert pm.is_key_path("reportWorkersByWorkerId['w1'].worker.name")
        assert pm.is_key_path("targetInstrumentsByTagNumber['T-001'].instrument.name")
        assert not pm.is_key_path("reportWorkersOrdered[1].worker.name")

    def test_is_primary_path_when_contains_primary(self) -> None:
        assert pm.is_primary_path("reportWorkerPrimary.worker.name")
        assert pm.is_primary_path("targetInstrumentPrimary.instrument.name")
        assert not pm.is_primary_path("reportWorkersOrdered[1].worker.name")


class TestHiddenKeys:
    def test_hidden_keys_contains_expected_system_metadata(self) -> None:
        assert "id" in pm.HIDDEN_KEYS
        assert "createdAt" in pm.HIDDEN_KEYS
        assert "updatedAt" in pm.HIDDEN_KEYS
        assert "sortOrder" in pm.HIDDEN_KEYS

    def test_is_hidden_key_for_id_variants_and_non_hidden_keys(self) -> None:
        assert pm.is_hidden_key("id")
        assert pm.is_hidden_key("companyId")
        assert pm.is_hidden_key("createdAt")
        assert not pm.is_hidden_key("name")

    def test_flatten_context_to_paths_never_emits_hidden_keys(self) -> None:
        context = {
            "id": "11111111-1111-1111-1111-111111111111",
            "companyId": "22222222-2222-2222-2222-222222222222",
            "createdAt": "2024-01-01",
            "name": "Test Company",
        }

        flat = pm.flatten_context_to_paths(context, "")
        paths = [item["path"] for item in flat]

        assert all(key not in paths for key in ("id", "companyId", "createdAt"))


class TestAppendPathSegmentAndBracketNotation:
    def test_uses_bracket_notation_for_hyphenated_or_numeric_keys(self) -> None:
        assert pm.append_path_segment("", "foo-bar") == "foo-bar"
        assert pm.append_path_segment("root", "foo-bar") == "root['foo-bar']"
        assert pm.append_path_segment("root", "0") == "root['0']"

    def test_escapes_single_quote_in_key_for_bracket_notation(self) -> None:
        result = pm.append_path_segment("root", "O'Reilly")
        assert result == "root['O\\'Reilly']"


class TestRunMatchScan:
    def test_run_match_scan_basic_flow(self) -> None:
        context = {
            "reportWorkersByRole": {
                "監督": {"worker": {"name": "Alice"}},
                "作業者": {"worker": {"name": "Bob"}},
            },
            "reportWorkersOrdered": [
                None,
                {"worker": {"name": "Alice"}},
                {"worker": {"name": "Bob"}},
            ],
        }
        grid = [
            ["Alice", None],
            ["Bob", "なし"],
        ]

        matches = pm.run_match_scan(context, grid, merge_cells=[], strategy="ordered")

        # 2 件ヒットし、値とプレースホルダ形式が期待通りであること
        assert len(matches) == 2
        by_value = {m.current_value: m for m in matches}
        assert "Alice" in by_value and "Bob" in by_value
        assert by_value["Alice"].placeholder.startswith("{{ ")
        assert by_value["Alice"].placeholder.endswith(" }}")

"""Tests for backend/autodraft/normalizers.py

Run with: pytest backend/autodraft/test_normalizers.py -v
"""
from __future__ import annotations

import pytest

# Adjust import path to match your project layout
from .normalizers import (
    append_unique_note,
    bounds_center_payload,
    clamp_value,
    collect_markup_semantic_text,
    infer_bounds_aspect,
    infer_page_position_zone,
    normalize_boolean,
    normalize_bounds,
    normalize_calibration_mode,
    normalize_compare_engine,
    normalize_compare_roi,
    normalize_display_text,
    normalize_point_pair_list,
    normalize_replacement_tuning,
    normalize_text,
    normalize_tolerance_profile,
    safe_float,
)


class TestNormalizeText:
    def test_basic(self):
        assert normalize_text("  HELLO  ") == "hello"

    def test_none(self):
        assert normalize_text(None) == ""

    def test_number(self):
        assert normalize_text(42) == "42"


class TestNormalizeDisplayText:
    def test_strips_html(self):
        result = normalize_display_text("<b>Bold</b> text")
        assert result == "Bold text"

    def test_replaces_br_with_space(self):
        result = normalize_display_text("line1<br/>line2")
        assert result == "line1 line2"

    def test_truncates_long_text(self):
        result = normalize_display_text("x" * 600, max_length=100)
        assert result is not None
        assert len(result) <= 100
        assert result.endswith("...")

    def test_returns_none_for_none(self):
        assert normalize_display_text(None) is None

    def test_returns_none_for_empty(self):
        assert normalize_display_text("") is None
        assert normalize_display_text("   ") is None


class TestSafeFloat:
    def test_valid_number(self):
        assert safe_float(3.14) == 3.14

    def test_string_number(self):
        assert safe_float("42.5") == 42.5

    def test_invalid_string(self):
        assert safe_float("abc") is None

    def test_none(self):
        assert safe_float(None) is None

    def test_infinity(self):
        assert safe_float(float("inf")) is None

    def test_nan(self):
        assert safe_float(float("nan")) is None


class TestClampValue:
    def test_within_range(self):
        assert clamp_value(0.5, minimum=0.0, maximum=1.0) == 0.5

    def test_below_min(self):
        assert clamp_value(-1.0, minimum=0.0, maximum=1.0) == 0.0

    def test_above_max(self):
        assert clamp_value(2.0, minimum=0.0, maximum=1.0) == 1.0


class TestNormalizeBounds:
    def test_valid_bounds(self):
        result = normalize_bounds({"x": 10, "y": 20, "width": 100, "height": 50})
        assert result == {"x": 10.0, "y": 20.0, "width": 100.0, "height": 50.0}

    def test_zero_width(self):
        assert normalize_bounds({"x": 0, "y": 0, "width": 0, "height": 10}) is None

    def test_negative_height(self):
        assert normalize_bounds({"x": 0, "y": 0, "width": 10, "height": -5}) is None

    def test_not_dict(self):
        assert normalize_bounds("not a dict") is None
        assert normalize_bounds(None) is None


class TestBoundsCenterPayload:
    def test_basic(self):
        result = bounds_center_payload({"x": 0, "y": 0, "width": 10, "height": 20})
        assert result == {"x": 5.0, "y": 10.0}

    def test_offset(self):
        result = bounds_center_payload({"x": 10, "y": 20, "width": 6, "height": 4})
        assert result == {"x": 13.0, "y": 22.0}


class TestNormalizeBoolean:
    def test_true_bool(self):
        assert normalize_boolean(True) is True

    def test_false_bool(self):
        assert normalize_boolean(False) is False

    def test_string_true(self):
        assert normalize_boolean("true") is True
        assert normalize_boolean("1") is True
        assert normalize_boolean("YES") is True

    def test_string_false(self):
        assert normalize_boolean("false") is False
        assert normalize_boolean("no") is False

    def test_default(self):
        assert normalize_boolean(None) is False
        assert normalize_boolean(None, default=True) is True


class TestNormalizeCompareEngine:
    def test_valid(self):
        assert normalize_compare_engine("python") == "python"
        assert normalize_compare_engine("dotnet") == "dotnet"
        assert normalize_compare_engine("auto") == "auto"

    def test_invalid_falls_back(self):
        assert normalize_compare_engine("invalid") == "auto"
        assert normalize_compare_engine(None) == "auto"

    def test_case_insensitive(self):
        assert normalize_compare_engine("PYTHON") == "python"


class TestNormalizeToleranceProfile:
    def test_valid(self):
        assert normalize_tolerance_profile("strict") == "strict"
        assert normalize_tolerance_profile("medium") == "medium"
        assert normalize_tolerance_profile("loose") == "loose"

    def test_invalid(self):
        assert normalize_tolerance_profile("extreme") == "medium"


class TestNormalizePointPairList:
    def test_valid(self):
        result = normalize_point_pair_list([{"x": 1, "y": 2}, {"x": 3, "y": 4}])
        assert result == [{"x": 1.0, "y": 2.0}, {"x": 3.0, "y": 4.0}]

    def test_wrong_count(self):
        assert normalize_point_pair_list([{"x": 1, "y": 2}]) is None
        assert normalize_point_pair_list([]) is None

    def test_invalid_coords(self):
        assert normalize_point_pair_list([{"x": "a", "y": 2}, {"x": 3, "y": 4}]) is None

    def test_not_list(self):
        assert normalize_point_pair_list("nope") is None


class TestNormalizeReplacementTuning:
    def test_defaults(self):
        result = normalize_replacement_tuning(None)
        assert result["unresolved_confidence_threshold"] == 0.36
        assert result["ambiguity_margin_threshold"] == 0.08

    def test_override(self):
        result = normalize_replacement_tuning({"unresolved_confidence_threshold": 0.5})
        assert result["unresolved_confidence_threshold"] == 0.5
        assert result["ambiguity_margin_threshold"] == 0.08  # kept default


class TestInferPagePositionZone:
    def test_bottom_right(self):
        bounds = {"x": 500, "y": 10, "width": 100, "height": 50}
        assert infer_page_position_zone(bounds, page_width=612, page_height=792) == "bottom-right"

    def test_center(self):
        bounds = {"x": 250, "y": 350, "width": 100, "height": 50}
        assert infer_page_position_zone(bounds, page_width=612, page_height=792) == "center"

    def test_zero_page_size(self):
        bounds = {"x": 0, "y": 0, "width": 10, "height": 10}
        assert infer_page_position_zone(bounds, page_width=0, page_height=0) == "unknown"


class TestInferBoundsAspect:
    def test_wide(self):
        assert infer_bounds_aspect({"width": 200, "height": 50}) == "wide"

    def test_tall(self):
        assert infer_bounds_aspect({"width": 30, "height": 100}) == "tall"

    def test_square(self):
        assert infer_bounds_aspect({"width": 100, "height": 100}) == "square"

    def test_zero(self):
        assert infer_bounds_aspect({"width": 0, "height": 100}) == "unknown"


class TestAppendUniqueNote:
    def test_adds_new(self):
        notes: list[str] = ["existing"]
        append_unique_note(notes, "new note")
        assert notes == ["existing", "new note"]

    def test_skips_duplicate(self):
        notes: list[str] = ["existing"]
        append_unique_note(notes, "existing")
        assert notes == ["existing"]

    def test_skips_empty(self):
        notes: list[str] = []
        append_unique_note(notes, "  ")
        assert notes == []


class TestCollectMarkupSemanticText:
    def test_combines_text_fields(self):
        markup = {
            "text": "VERIFY TAG",
            "meta": {"subject": "note", "intent": "verify"},
        }
        result = collect_markup_semantic_text(markup)
        assert "VERIFY TAG" in result
        assert "note" in result

    def test_deduplicates(self):
        markup = {
            "text": "same",
            "meta": {"subject": "same"},
        }
        result = collect_markup_semantic_text(markup)
        assert result.count("same") == 1

    def test_empty_markup(self):
        assert collect_markup_semantic_text({}) == ""

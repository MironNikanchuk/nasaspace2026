import json
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from lunawindow.api import app

DEMO = {
    "site_id": "connecting-ridge",
    "start_utc": "2027-01-07T00:00:00Z",
    "end_utc": "2027-01-14T00:00:00Z",
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_catalog_health_and_openapi(client):
    health = client.get("/api/v1/health").json()
    catalog = client.get("/api/v1/sites").json()
    assert health["status"] == "ready"
    assert health["site_count"] == len(catalog["sites"]) == 3
    assert health["dataset_version"] == catalog["dataset"]["version"]
    assert catalog["sites"][0]["start_utc"] == "2027-01-01T00:00:00Z"
    assert catalog["sites"][0]["end_utc"] == "2027-04-01T00:00:00Z"
    assert catalog["dataset"]["step_minutes"] == 30
    assert "/api/v1/compare" in client.get("/openapi.json").json()["paths"]


def test_real_horizons_comparison_returns_metrics_and_rows(client):
    response = client.post(
        "/api/v1/compare",
        json={"scenarios": [DEMO, {**DEMO, "site_id": "malapert-massif"}]},
    )
    assert response.status_code == 200
    left, right = response.json()["scenarios"]
    assert left["summary"]["sun_visible_percent"] == 100
    assert left["summary"]["both_visible_percent"] == pytest.approx(40.76)
    assert right["summary"]["sun_visible_percent"] == 0
    assert right["summary"]["earth_visible_percent"] == pytest.approx(87.541)
    assert right["windows"]["both"] == []
    assert left["model"]["horizon"] == "geometric"
    assert len(left["samples"]) == 337

    horizons_row = {
        "site_id": "connecting-ridge",
        "start_utc": "2027-01-01T00:00:00Z",
        "end_utc": "2027-01-01T00:20:00Z",
    }
    response = client.post("/api/v1/compare", json={"scenarios": [horizons_row, DEMO]})
    data = response.json()["scenarios"][0]["samples"]
    assert len(data) == 2
    assert data[0]["sun"]["azimuth_deg"] == pytest.approx(40.613102)
    assert data[0]["sun"]["elevation_deg"] == pytest.approx(1.421433)
    assert data[-1]["time_utc"] == "2027-01-01T00:20:00Z"


def test_same_site_can_be_compared_in_different_ranges(client):
    early = {**DEMO, "start_utc": "2027-01-01T05:00:00+05:00", "end_utc": "2027-01-07T00:00:00Z"}
    response = client.post("/api/v1/compare", json={"scenarios": [early, DEMO]})
    assert response.status_code == 200
    first, second = response.json()["scenarios"]
    assert first["start_utc"] == "2027-01-01T00:00:00Z"
    assert first["summary"]["earth_visible_percent"] == 0
    assert second["summary"]["earth_visible_percent"] > 0


@pytest.mark.parametrize(
    ("change", "error_type"),
    [
        ({"site_id": "moon-centre"}, "unknown_site"),
        ({"start_utc": "2026-12-31T23:00:00Z"}, "outside_coverage"),
        ({"start_utc": "2027-01-07T00:00:00"}, "timezone_aware"),
        ({"end_utc": "2027-01-07T00:00:00Z"}, "value_error"),
        ({"end_utc": "2027-04-01T00:00:00Z"}, "value_error"),
        ({"start_utc": "0001-01-01T00:00:00+01:00"}, "value_error"),
        ({"end_utc": "9999-12-31T23:59:59-01:00"}, "value_error"),
    ],
)
def test_invalid_scenarios_return_actionable_errors(client, change, error_type):
    response = client.post("/api/v1/compare", json={"scenarios": [{**DEMO, **change}, DEMO]})
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == error_type


def test_requires_two_scenarios(client):
    response = client.post("/api/v1/compare", json={"scenarios": [DEMO]})
    assert response.status_code == 422


@pytest.mark.parametrize("number", ["1e999", "NaN", "Infinity", "-Infinity"])
def test_nonfinite_coordinates_return_json_validation_errors(client, number):
    scenario = {
        "start_utc": DEMO["start_utc"],
        "end_utc": DEMO["end_utc"],
        "coordinates": {"latitude_deg": -89.4, "longitude_east_deg": "replace-me"},
    }
    response = client.post(
        "/api/v1/compare",
        content=json.dumps({"scenarios": [scenario, DEMO]}).replace('"replace-me"', number),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == "longitude_east_deg"


def test_terrain_crossing_is_consistent_across_nested_intervals(client):
    broad = {
        **DEMO,
        "horizon": "terrain",
        "start_utc": "2027-02-04T02:00:00Z",
        "end_utc": "2027-02-04T02:30:00Z",
    }
    narrow = {**broad, "start_utc": "2027-02-04T02:14:00Z", "end_utc": "2027-02-04T02:14:30Z"}
    response = client.post("/api/v1/compare", json={"scenarios": [broad, narrow]})
    assert response.status_code == 200
    full, inset = response.json()["scenarios"]
    assert full["model"]["crossing_method"] == "piecewise_terrain_interpolation"
    crossing = datetime.fromisoformat(full["windows"]["sun"][0]["start_utc"])
    assert (
        datetime.fromisoformat(inset["end_utc"])
        < crossing
        < datetime.fromisoformat("2027-02-04T02:16:00Z")
    )
    assert inset["windows"]["sun"] == []
    through_crossing = {**narrow, "end_utc": "2027-02-04T02:17:00Z"}
    response = client.post("/api/v1/compare", json={"scenarios": [broad, through_crossing]})
    assert response.json()["scenarios"][1]["windows"]["sun"][0][
        "start_utc"
    ] == crossing.isoformat().replace("+00:00", "Z")


def test_terrain_is_available_only_for_profiled_sites(client):
    response = client.post(
        "/api/v1/compare",
        json={"scenarios": [DEMO, {**DEMO, "site_id": "malapert-massif", "horizon": "terrain"}]},
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "terrain_unavailable"

    catalog = client.get("/api/v1/sites").json()
    assert catalog["sites"][0]["supported_horizons"] == ["geometric", "terrain"]
    response = client.post(
        "/api/v1/compare", json={"scenarios": [DEMO, {**DEMO, "horizon": "terrain"}]}
    )
    assert response.status_code == 200
    geometric, terrain = response.json()["scenarios"]
    assert terrain["model"]["resolution_m"] == 80
    assert terrain["model"]["observer_height_m"] == 2
    assert geometric["summary"] != terrain["summary"]
    sample = terrain["samples"][0]["sun"]
    assert sample["horizon_elevation_deg"] != 0
    assert sample["above_horizon"] == (sample["elevation_deg"] > sample["horizon_elevation_deg"])


def test_coordinate_input_when_spice_is_disabled(monkeypatch):
    monkeypatch.delenv("LUNAWINDOW_SPICE_KERNEL_DIR", raising=False)
    custom = {key: value for key, value in DEMO.items() if key != "site_id"}
    custom["coordinates"] = {"latitude_deg": -89.4, "longitude_east_deg": 222.51}
    with TestClient(app) as test_client:
        response = test_client.post("/api/v1/compare", json={"scenarios": [DEMO, custom]})
        assert response.status_code == 422
        assert response.json()["detail"][0]["type"] == "custom_coordinates_unavailable"

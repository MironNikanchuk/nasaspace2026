import os
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from lunawindow.api import app


@pytest.mark.parametrize("nested", [True, False])
def test_startup_loads_documented_or_flat_kernels(tmp_path, monkeypatch, nested):
    paths = [
        tmp_path / path
        for path in (
            "lsk/naif0012.tls",
            "pck/pck00011.tpc",
            "fk/satellites/moon_de440_250416.tf",
            "pck/moon_pa_de440_200625.bpc",
            "spk/planets/de440s.bsp",
        )
    ]
    if not nested:
        paths = [tmp_path / path.name for path in paths]
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    loaded = []
    monkeypatch.setitem(sys.modules, "spiceypy", SimpleNamespace(furnsh=loaded.append))
    monkeypatch.setenv("LUNAWINDOW_SPICE_KERNEL_DIR", str(tmp_path))
    with TestClient(app) as client:
        assert client.get("/api/v1/sites").json()["custom_coordinates_supported"]
    assert loaded == list(map(str, paths))


@pytest.mark.skipif(
    not os.environ.get("LUNAWINDOW_SPICE_KERNEL_DIR"),
    reason="Set LUNAWINDOW_SPICE_KERNEL_DIR for the NAIF integration test",
)
def test_custom_coordinates_match_catalog_observer():
    dates = {"start_utc": "2027-01-01T00:00:00Z", "end_utc": "2027-01-07T00:17:00Z"}
    with TestClient(app) as client:
        assert client.get("/api/v1/sites").json()["custom_coordinates_supported"]
        response = client.post(
            "/api/v1/compare",
            json={
                "scenarios": [
                    {**dates, "site_id": "connecting-ridge"},
                    {
                        **dates,
                        "coordinates": {"latitude_deg": -89.4632, "longitude_east_deg": 222.51},
                    },
                ]
            },
        )
    assert response.status_code == 200
    catalog, custom = response.json()["scenarios"]
    assert custom["ephemeris"] == "NAIF SPICE DE440"
    assert custom["samples"][-1]["time_utc"] == dates["end_utc"]
    for a, b in zip(catalog["samples"], custom["samples"], strict=True):
        for body in ("sun", "earth"):
            assert a[body]["azimuth_deg"] == pytest.approx(b[body]["azimuth_deg"], abs=1e-5)
            assert a[body]["elevation_deg"] == pytest.approx(b[body]["elevation_deg"], abs=1e-5)

"""Generate or verify the frontend data from the backend catalog and terrain."""

import argparse
import json
from dataclasses import asdict

from lunawindow.api import MAX_DURATION_DAYS, Scenario, dataset_info, evaluate
from lunawindow.ephemeris import DATA_DIR, Dataset
from lunawindow.terrain import load_terrain
from lunawindow.visibility import DISK_MODES

FRONTEND = DATA_DIR.parents[1] / "frontend" / "data"
OFFLINE = FRONTEND.parent / "public" / "ephemeris"
DEMO_IDS = {"connecting-ridge", "shackleton-rim", "malapert-massif"}

START = "2027-01-07T00:00:00Z"
END = "2027-01-14T00:00:00Z"


def generate_snapshot() -> bytes:
    dataset = Dataset.load()
    terrain = load_terrain()
    catalog = {
        "sites": [],
        "dataset": dataset_info(dataset).model_dump(mode="json"),
        "max_duration_days": MAX_DURATION_DAYS,
        "custom_coordinates_supported": False,
    }
    results = {}
    for site_id, site in dataset.sites.items():
        series = dataset.series[site_id]
        horizons = ["geometric", "terrain"] if site_id in terrain else ["geometric"]
        for horizon in horizons if site_id in DEMO_IDS else ():
            scenario = Scenario.model_validate(
                {"site_id": site_id, "start_utc": START, "end_utc": END, "horizon": horizon}
            )
            result = evaluate(
                site, series, scenario, terrain.get(site_id) if horizon == "terrain" else None
            )
            results[f"{site_id}:{horizon}"] = result.model_dump(mode="json")
        catalog["sites"].append(
            {
                "site": asdict(site),
                "start_utc": series.start_utc.isoformat().replace("+00:00", "Z"),
                "end_utc": series.end_utc.isoformat().replace("+00:00", "Z"),
                "supported_horizons": horizons,
            }
        )
    return json.dumps({"catalog": catalog, "results": results}, separators=(",", ":")).encode()


def offline_sites():
    dataset = Dataset.load()
    terrain = load_terrain()
    for site_id, site in dataset.sites.items():
        series = dataset.series[site_id]
        outputs = {}
        horizons = ["geometric", "terrain"] if site_id in terrain else ["geometric"]
        for horizon in horizons:
            for visibility in DISK_MODES:
                # This internal export covers the full source grid. The API limits user queries.
                scenario = Scenario.model_construct(
                    site_id=site_id,
                    start_utc=series.start_utc,
                    end_utc=series.end_utc,
                    horizon=horizon,
                    visibility=visibility,
                )
                result = evaluate(
                    site, series, scenario, terrain.get(site_id) if horizon == "terrain" else None
                )
                windows = [
                    [
                        [
                            round((w.start_utc - series.start_utc).total_seconds() * 1000),
                            round((w.end_utc - series.start_utc).total_seconds() * 1000),
                        ]
                        for w in getattr(result.windows, body)
                    ]
                    for body in ("sun", "earth", "both")
                ]
                outputs[f"{horizon}:{visibility}"] = {
                    "model": result.model.model_dump(),
                    "windows": windows,
                }
        rows = [
            [sun.azimuth_deg, sun.elevation_deg, earth.azimuth_deg, earth.elevation_deg]
            for sun, earth in series.positions
        ]
        data = {"version": dataset.version, "rows": rows, "results": outputs}
        yield OFFLINE / f"{site_id}.json", json.dumps(data, separators=(",", ":")).encode()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    check = parser.parse_args().check
    files = {
        FRONTEND / "demo.json": generate_snapshot(),
        FRONTEND / "terrain.json": (DATA_DIR / "terrain.json").read_bytes(),
        **dict(offline_sites()),
    }
    for path, data in files.items():
        if check:
            if not path.exists() or path.read_bytes() != data:
                parser.exit(
                    1, f"{path} is stale. Run python -m scripts.sync_frontend_data from backend/.\n"
                )
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)


if __name__ == "__main__":
    main()

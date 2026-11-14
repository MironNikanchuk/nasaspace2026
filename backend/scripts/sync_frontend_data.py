"""Generate or verify the frontend data from the backend catalog and terrain."""

import argparse
import json

from lunawindow.api import MAX_DURATION_DAYS, Scenario, dataset_info, evaluate
from lunawindow.ephemeris import DATA_DIR, Dataset
from lunawindow.terrain import load_terrain

FRONTEND = DATA_DIR.parents[1] / "frontend" / "data"
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
        for horizon in horizons:
            scenario = Scenario.model_validate(
                {"site_id": site_id, "start_utc": START, "end_utc": END, "horizon": horizon}
            )
            result = evaluate(
                site, series, scenario, terrain.get(site_id) if horizon == "terrain" else None
            )
            results[f"{site_id}:{horizon}"] = result.model_dump(mode="json")
        catalog["sites"].append(
            {
                "site": results[f"{site_id}:geometric"]["site"],
                "start_utc": series.start_utc.isoformat().replace("+00:00", "Z"),
                "end_utc": series.end_utc.isoformat().replace("+00:00", "Z"),
                "supported_horizons": horizons,
            }
        )
    return json.dumps({"catalog": catalog, "results": results}, separators=(",", ":")).encode()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    check = parser.parse_args().check
    files = {
        "demo.json": generate_snapshot(),
        "terrain.json": (DATA_DIR / "terrain.json").read_bytes(),
    }
    for name, data in files.items():
        path = FRONTEND / name
        if check:
            if not path.exists() or path.read_bytes() != data:
                parser.exit(
                    1, f"{path} is stale. Run python -m scripts.sync_frontend_data from backend/.\n"
                )
        else:
            path.write_bytes(data)


if __name__ == "__main__":
    main()

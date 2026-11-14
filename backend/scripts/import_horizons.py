"""Fetch or rebuild the bundled dataset from JPL observer tables."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import re
from datetime import UTC, datetime, timedelta
from math import isclose
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from lunawindow.ephemeris import DATA_DIR, Dataset, Position, Site, load_sites, read_utc

URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
TARGETS = {"sun": "10", "earth": "399"}
AUDITED_API_VERSIONS = {"1.2", "1.3"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def query_parameters(site: Site, target: str, start: datetime, end: datetime) -> dict[str, str]:
    options = {
        "COMMAND": target,
        "CENTER": "coord@301",
        "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"{site.longitude_east_deg},{site.latitude_deg},{site.observer_altitude_km}",
        "EPHEM_TYPE": "OBSERVER",
        "START_TIME": start.strftime("%Y-%m-%d %H:%M"),
        "STOP_TIME": end.strftime("%Y-%m-%d %H:%M"),
        "STEP_SIZE": "30 m",
        "QUANTITIES": "4",
        "CSV_FORMAT": "YES",
        "TIME_TYPE": "UT",
        "APPARENT": "AIRLESS",
    }
    return {"format": "json", **{key: f"'{value}'" for key, value in options.items()}}


def parse_table(
    payload: dict, site: Site, target: str, start: datetime, end: datetime
) -> tuple[str, str, list[list[float]]]:
    if payload.get("error"):
        raise ValueError(f"Horizons rejected the request: {payload['error']}")
    version = payload.get("signature", {}).get("version")
    if version not in AUDITED_API_VERSIONS:
        raise ValueError(f"Review the Horizons response format before importing API {version!r}")

    header, marker, rows_and_footer = payload["result"].partition("$$SOE")
    table, stop_marker, _ = rows_and_footer.partition("$$EOE")
    if not marker or not stop_marker:
        raise ValueError("Missing Horizons table markers")

    source = re.search(
        r"(?m)^Target body name:[^\n]+\((" + target + r")\)\s+"
        r"\{source:\s*([\w-]+)\}",
        header,
    )
    center = re.search(r"(?m)^Center geodetic\s*:\s*([^,\s]+),\s*([^,\s]+),\s*(\S+)", header)
    expected_observer = (site.longitude_east_deg, site.latitude_deg, site.observer_altitude_km)
    if (
        source is None
        or center is None
        or not all(
            isclose(float(reported), expected, rel_tol=0, abs_tol=1e-8)
            for reported, expected in zip(center.groups(), expected_observer, strict=True)
        )
        or "Center body name: Moon (301)" not in header
        or not re.search(r"Center pole/equ\s*:\s*MEAN_ME", header)
        or "NO (AIRLESS)" not in header
        or "Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app)," not in header
    ):
        raise ValueError(
            f"Horizons header did not match target and observer for {site.id}/{target}"
        )

    points = []
    step = timedelta(minutes=30)
    for i, row in enumerate(csv.reader(table.strip().splitlines())):
        when = start + i * step
        day = f"{when.year:04d}-{MONTHS[when.month - 1]}-{when.day:02d}"
        if row[0].strip() != f"{day} {when:%H:%M}":
            raise ValueError(f"Missing, duplicate or off-grid Horizons row at {when.isoformat()}")
        position = Position(float(row[3]), float(row[4]))
        points.append([position.azimuth_deg, position.elevation_deg])
    if len(points) != (end - start) // step + 1:
        raise ValueError(f"Unexpected row count for {site.id}/{target}: {len(points)}")
    return version, source[2], points


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default="2027-01-01T00:00:00+00:00")
    parser.add_argument("--end", default="2027-04-01T00:00:00+00:00")
    parser.add_argument("--raw-dir", type=Path, required=True)
    parser.add_argument("--contact", help="Project email or support URL for the JPL User-Agent")
    parser.add_argument("--offline", action="store_true", help="Reuse existing raw responses only")
    args = parser.parse_args()
    start, end = read_utc(args.start), read_utc(args.end)
    step = timedelta(minutes=30)
    if (
        start >= end
        or start.minute % 30
        or start.second
        or start.microsecond
        or (end - start) % step
    ):
        parser.error("Expected increasing UTC times on a 30-minute grid")
    if not args.offline and not args.contact:
        parser.error("--contact is required for downloads")

    args.raw_dir.mkdir(parents=True, exist_ok=True)
    versions, ephemerides, payload_sites = set(), set(), {}
    for site in load_sites().values():
        positions = {}
        for body, target in TARGETS.items():
            raw = args.raw_dir / f"lunawindow-{site.id}-{body}.json"
            if raw.exists() or args.offline:
                payload = json.loads(raw.read_text(encoding="utf-8"))
            else:
                query = urlencode(query_parameters(site, target, start, end))
                request = Request(
                    f"{URL}?{query}", headers={"User-Agent": f"LunaWindow/0.1 (+{args.contact})"}
                )
                with urlopen(request, timeout=60) as response:
                    payload = json.load(response)
            version, ephemeris, positions[body] = parse_table(payload, site, target, start, end)
            if not raw.exists():
                raw.write_text(json.dumps(payload), encoding="utf-8")
            versions.add(version)
            ephemerides.add(ephemeris)
        payload_sites[site.id] = {
            "observer": [site.longitude_east_deg, site.latitude_deg, site.observer_altitude_km],
            "rows": [
                sun + earth for sun, earth in zip(positions["sun"], positions["earth"], strict=True)
            ],
        }

    if len(versions) != 1 or len(ephemerides) != 1:
        raise ValueError("Horizons version or ephemeris changed during import")
    imported = datetime.now(UTC).replace(microsecond=0)
    payload = {
        "format_version": 1,
        "dataset_version": f"horizons-{imported:%Y%m%dT%H%M%SZ}",
        "imported_at_utc": imported.isoformat(),
        "horizons_api_version": versions.pop(),
        "ephemeris": ephemerides.pop(),
        "start_utc": start.isoformat(),
        "end_utc": end.isoformat(),
        "step_minutes": 30,
        "sites": payload_sites,
    }
    destination = DATA_DIR / "horizons.json.gz"
    with NamedTemporaryFile(dir=destination.parent, suffix=".json.gz", delete=False) as buffer:
        temp_path = Path(buffer.name)
    try:
        temp_path.write_bytes(
            gzip.compress(json.dumps(payload, separators=(",", ":")).encode(), mtime=0)
        )
        Dataset.load(temp_path)
        temp_path.chmod(0o644)
        os.replace(temp_path, destination)
    finally:
        temp_path.unlink(missing_ok=True)
    print(f"Saved {len(payload_sites)} sites to {destination}")


if __name__ == "__main__":
    main()

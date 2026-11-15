"""Compare JPL Horizons DE441 positions with local NAIF SPICE DE440 kernels."""

import argparse
import json
from pathlib import Path

from lunawindow.ephemeris import DATA_DIR, Dataset
from lunawindow.spice_provider import SpiceProvider


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kernels", type=Path)
    args = parser.parse_args()
    horizons = Dataset.load()
    spice = SpiceProvider(args.kernels)
    maximum = {"sun": 0.0, "earth": 0.0}
    count = 0
    for site_id, reference in horizons.series.items():
        check = spice.series(
            horizons.sites[site_id], reference.start_utc, reference.end_utc, reference.step
        )
        for a, b in zip(reference.positions, check.positions, strict=True):
            count += 1
            for body, left, right in zip(maximum, a, b, strict=True):
                maximum[body] = max(maximum[body], abs(left.elevation_deg - right.elevation_deg))
    result = {
        "start_utc": reference.start_utc.isoformat(),
        "end_utc": reference.end_utc.isoformat(),
        "site_count": len(horizons.sites),
        "timestamps_across_sites": count,
        "maximum_elevation_difference_deg": {
            key: round(value, 8) for key, value in maximum.items()
        },
    }
    output = DATA_DIR.parents[1] / "frontend" / "data" / "ephemeris-validation.json"
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()

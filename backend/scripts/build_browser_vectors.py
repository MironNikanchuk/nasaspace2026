"""Generate Moon-fixed, apparent Sun/Earth vectors for browser-only comparisons."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from lunawindow.spice_provider import FRAME, SpiceProvider

ROOT = Path(__file__).resolve().parents[2]
START = datetime(2027, 1, 1, tzinfo=UTC)
END = datetime(2027, 4, 1, tzinfo=UTC)
STEP = timedelta(minutes=30)


def main() -> None:
    # The same loaded kernels, frame and aberration convention as the live API.
    spice = SpiceProvider(ROOT / "backend/data/kernels")._spice
    rows = []
    for i in range((END - START) // STEP + 1):
        et = spice.str2et((START + i * STEP).strftime("%Y-%m-%dT%H:%M:%S"))
        row = []
        for target in ("10", "399"):
            state, _ = spice.spkcpo(target, et, FRAME, "OBSERVER", "CN+S", [0, 0, 0], "301", FRAME)
            row.extend(round(float(axis), 4) for axis in state[:3])
        rows.append(row)
    path = ROOT / "frontend/public/ephemeris/moon-vectors-v1.json"
    path.write_text(json.dumps({"start_utc": START.isoformat(), "rows": rows}, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()

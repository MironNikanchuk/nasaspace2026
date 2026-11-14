from __future__ import annotations

import json
from dataclasses import dataclass
from math import isfinite
from pathlib import Path

from .ephemeris import DATA_DIR


@dataclass(frozen=True)
class TerrainProfile:
    source_url: str
    resolution_m: int
    range_m: int
    observer_height_m: float
    observer_altitude_m: float
    azimuth_step_deg: float
    elevations_deg: tuple[float, ...]

    def horizon_at(self, azimuth_deg: float) -> float:
        index, remainder = divmod(azimuth_deg, self.azimuth_step_deg)
        first = int(index)
        left = self.elevations_deg[first]
        right = self.elevations_deg[(first + 1) % len(self.elevations_deg)]
        return left + (right - left) * (remainder / self.azimuth_step_deg)


def load_terrain(path: Path = DATA_DIR / "terrain.json") -> dict[str, TerrainProfile]:
    if not path.exists():
        return {}

    payload = json.loads(path.read_text(encoding="utf-8"))
    shared = {key: value for key, value in payload.items() if key != "sites"}
    profiles = {}
    for site_id, values in payload["sites"].items():
        elevations = tuple(values["elevations_deg"])
        profile = TerrainProfile(
            **shared, observer_altitude_m=values["observer_altitude_m"], elevations_deg=elevations
        )
        if (
            profile.azimuth_step_deg <= 0
            or len(elevations) * profile.azimuth_step_deg != 360
            or not all(isfinite(value) and -90 <= value <= 90 for value in elevations)
            or not isfinite(profile.observer_altitude_m)
        ):
            raise ValueError(f"Invalid terrain profile for {site_id}")
        profiles[site_id] = profile
    return profiles

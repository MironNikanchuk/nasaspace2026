from __future__ import annotations

import gzip
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import isfinite
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SITE_SOURCE = (
    "https://ntrs.nasa.gov/api/citations/20250002845/downloads/"
    "M2M-30044%20Lunar%20Surface%20Data%20Book%20Baseline_Final.pdf"
)
HORIZONS_SOURCE = "https://ssd.jpl.nasa.gov/horizons/"


@dataclass(frozen=True)
class Site:
    id: str
    name: str
    latitude_deg: float
    longitude_east_deg: float
    observer_altitude_km: float
    source_site_id: str | None


@dataclass(frozen=True)
class Position:
    azimuth_deg: float
    elevation_deg: float

    def __post_init__(self) -> None:
        if not (
            isfinite(self.azimuth_deg)
            and isfinite(self.elevation_deg)
            and 0 <= self.azimuth_deg < 360
            and -90 <= self.elevation_deg <= 90
        ):
            raise ValueError("Invalid ephemeris angles")

    def interpolate(self, other: Position, fraction: float) -> Position:
        azimuth_delta = (other.azimuth_deg - self.azimuth_deg + 180) % 360 - 180
        elevation = self.elevation_deg + fraction * (other.elevation_deg - self.elevation_deg)
        azimuth = (self.azimuth_deg + fraction * azimuth_delta) % 360
        return Position(0.0 if azimuth == 360 else azimuth, elevation)


@dataclass(frozen=True)
class Sample:
    time_utc: datetime
    sun: Position
    earth: Position


@dataclass(frozen=True)
class Series:
    start_utc: datetime
    step: timedelta
    positions: tuple[tuple[Position, Position], ...]

    @property
    def end_utc(self) -> datetime:
        return self.start_utc + (len(self.positions) - 1) * self.step

    def sample_at(self, when: datetime) -> Sample:
        if not self.start_utc <= when <= self.end_utc:
            raise ValueError("Time is outside ephemeris coverage")

        index, remainder = divmod(when - self.start_utc, self.step)
        sun, earth = self.positions[index]
        if remainder:
            next_sun, next_earth = self.positions[index + 1]
            fraction = remainder / self.step
            sun = sun.interpolate(next_sun, fraction)
            earth = earth.interpolate(next_earth, fraction)
        return Sample(when, sun, earth)

    def samples_between(self, start: datetime, end: datetime) -> list[Sample]:
        samples = [self.sample_at(start)]
        next_index = (start - self.start_utc) // self.step + 1
        timestamp = self.start_utc + self.step * next_index
        while timestamp < end:
            samples.append(self.sample_at(timestamp))
            timestamp += self.step
        samples.append(self.sample_at(end))
        return samples


@dataclass(frozen=True)
class Dataset:
    version: str
    imported_at_utc: datetime
    horizons_api_version: str
    ephemeris: str
    sites: dict[str, Site]
    series: dict[str, Series]

    @classmethod
    def load(cls, path: Path = DATA_DIR / "horizons.json.gz") -> Dataset:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            payload = json.load(handle)
        if payload["format_version"] != 1:
            raise ValueError("Unsupported dataset format")

        sites = load_sites()
        start = read_utc(payload["start_utc"])
        end = read_utc(payload["end_utc"])
        step = timedelta(minutes=payload["step_minutes"])
        if end <= start or step <= timedelta(0) or (end - start) % step:
            raise ValueError("Invalid dataset coverage")
        count = (end - start) // step + 1

        if set(payload["sites"]) != sites.keys():
            raise ValueError("Ephemeris and catalog site IDs differ")

        series = {}
        for site_id, data in payload["sites"].items():
            site = sites[site_id]
            if data["observer"] != [
                site.longitude_east_deg,
                site.latitude_deg,
                site.observer_altitude_km,
            ]:
                raise ValueError(f"Observer coordinates changed for {site_id}")
            rows = data["rows"]
            if len(rows) != count:
                raise ValueError(f"Missing or excess ephemeris samples for {site_id}")
            series[site_id] = Series(
                start,
                step,
                tuple(
                    (Position(sun_az, sun_el), Position(earth_az, earth_el))
                    for sun_az, sun_el, earth_az, earth_el in rows
                ),
            )

        return cls(
            payload["dataset_version"],
            read_utc(payload["imported_at_utc"]),
            payload["horizons_api_version"],
            payload["ephemeris"],
            sites,
            series,
        )


def read_utc(value: str) -> datetime:
    timestamp = datetime.fromisoformat(value)
    if timestamp.tzinfo is None:
        raise ValueError("Dataset timestamps must specify a time zone")
    return timestamp.astimezone(UTC)


def load_sites() -> dict[str, Site]:
    entries = json.loads((DATA_DIR / "sites.json").read_text(encoding="utf-8"))
    return {entry["id"]: Site(**entry) for entry in entries}

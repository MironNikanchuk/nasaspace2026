from __future__ import annotations

from datetime import UTC, datetime, timedelta
from math import atan2, cos, degrees, hypot, radians, sin
from pathlib import Path
from threading import Lock

from .ephemeris import Position, Series, Site

SOURCE_URL = "https://naif.jpl.nasa.gov/naif/"
KERNELS = (
    "naif0012.tls",
    "pck00011.tpc",
    "moon_de440_250416.tf",
    "moon_pa_de440_200625.bpc",
    "de440s.bsp",
)
FRAME = "MOON_ME_DE440_ME421"


class SpiceProvider:
    def __init__(self, directory: Path) -> None:
        try:
            import spiceypy
        except ModuleNotFoundError as error:
            raise RuntimeError("Install the spice dependency group to enable NAIF SPICE") from error
        missing = [name for name in KERNELS if not (directory / name).is_file()]
        if missing:
            raise RuntimeError(f"Missing NAIF kernels: {', '.join(missing)}")

        self._spice = spiceypy
        self._lock = Lock()
        for filename in KERNELS:
            self._spice.furnsh(str(directory / filename))

    def series(self, observer: Site, start: datetime, end: datetime, step: timedelta) -> Series:
        # Use the same global half-hour grid as the catalog.
        grid_start = start.replace(minute=start.minute // 30 * 30, second=0, microsecond=0)
        count, tail = divmod(end - grid_start, step)
        if tail:
            count += 1

        latitude, longitude = radians(observer.latitude_deg), radians(observer.longitude_east_deg)
        east = (-sin(longitude), cos(longitude), 0.0)
        north = (-sin(latitude) * cos(longitude), -sin(latitude) * sin(longitude), cos(latitude))
        up = (cos(latitude) * cos(longitude), cos(latitude) * sin(longitude), sin(latitude))
        radius = 1737.4 + observer.observer_altitude_km
        location = [radius * component for component in up]

        def position(target: str, et: float) -> Position:
            state, _ = self._spice.spkcpo(
                target, et, FRAME, "OBSERVER", "CN+S", location, "301", FRAME
            )
            e, n, u = (sum(a * b for a, b in zip(state[:3], axis)) for axis in (east, north, up))
            azimuth = degrees(atan2(e, n)) % 360
            return Position(0.0 if azimuth == 360 else azimuth, degrees(atan2(u, hypot(e, n))))

        positions = []
        # CSPICE uses global state and is not thread-safe.
        with self._lock:
            for index in range(count + 1):
                timestamp = (grid_start + step * index).astimezone(UTC)
                et = self._spice.str2et(timestamp.strftime("%Y-%m-%dT%H:%M:%S.%f"))
                positions.append((position("10", et), position("399", et)))
        return Series(grid_start, step, tuple(positions))

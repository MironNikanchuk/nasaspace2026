"""Build horizon profiles from the NASA LOLA 80 m south-pole DEM."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

from lunawindow.ephemeris import DATA_DIR, Site, load_sites

RADIUS_M = 1_737_400
PIXEL_M = 80
RANGE_M = 45_000
OBSERVER_HEIGHT_M = 2
AZIMUTH_STEP_DEG = 0.5
SOURCE_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF"


def polar_stereographic(longitude, latitude):
    rho = 2 * RADIUS_M * np.tan(np.pi / 4 + latitude / 2)
    return rho * np.sin(longitude), rho * np.cos(longitude)


def radial_points(site: Site, azimuth, distance):
    lat0 = np.deg2rad(site.latitude_deg)
    lon0 = np.deg2rad(site.longitude_east_deg)
    arc = distance / RADIUS_M
    lat = np.arcsin(np.sin(lat0) * np.cos(arc) + np.cos(lat0) * np.sin(arc) * np.cos(azimuth))
    lon = lon0 + np.arctan2(
        np.sin(azimuth) * np.sin(arc) * np.cos(lat0),
        np.cos(arc) - np.sin(lat0) * np.sin(lat),
    )
    return polar_stereographic(lon, lat)


def sample_surface(raster, x, y):
    cols, rows = (~raster.transform) * (x, y)
    cols, rows = cols - 0.5, rows - 0.5
    c0, r0 = np.floor(cols).astype(int), np.floor(rows).astype(int)
    left, top = int(c0.min()), int(r0.min())
    width, height = int(c0.max()) - left + 2, int(r0.max()) - top + 2
    if left < 0 or top < 0 or left + width > raster.width or top + height > raster.height:
        raise ValueError("Terrain profile crosses the DEM boundary")

    surface = raster.read(1, window=Window(left, top, width, height), masked=True)
    c, r = c0 - left, r0 - top
    dx, dy = cols - c0, rows - r0
    elevations = (1 - dy) * ((1 - dx) * surface[r, c] + dx * surface[r, c + 1]) + dy * (
        (1 - dx) * surface[r + 1, c] + dx * surface[r + 1, c + 1]
    )
    if np.any(np.ma.getmaskarray(elevations)) or not np.all(np.isfinite(elevations)):
        raise ValueError("Terrain profile intersects DEM nodata")
    return np.asarray(elevations)


def horizon(raster, site: Site) -> dict:
    step_count = round(360 / AZIMUTH_STEP_DEG)
    azimuth = np.deg2rad(np.arange(step_count))[:, None] * AZIMUTH_STEP_DEG
    distance = np.append(np.arange(0, RANGE_M, PIXEL_M), RANGE_M)[None, :]
    x, y = radial_points(site, azimuth, distance)
    elevations = sample_surface(raster, x, y)
    observer = float(elevations[0, 0]) + OBSERVER_HEIGHT_M
    arc = distance[:, 1:] / RADIUS_M
    radius = RADIUS_M + elevations[:, 1:]
    up = radius * np.cos(arc) - (RADIUS_M + observer)
    forward = radius * np.sin(arc)
    angles = np.rad2deg(np.arctan2(up, forward))
    return {
        "observer_altitude_m": round(observer, 3),
        "elevations_deg": np.round(np.max(angles, axis=1), 5).tolist(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dem", type=Path, help="NASA LDEM_80S_80MPP_ADJ.TIF")
    args = parser.parse_args()

    sites = load_sites()
    with rasterio.open(args.dem) as raster:
        crs = raster.crs.to_dict()
        if not (
            crs.get("proj") == "stere"
            and crs.get("lat_0") == -90
            and crs.get("lon_0") == 0
            and crs.get("R", crs.get("a")) == RADIUS_M
            and raster.res == (PIXEL_M, PIXEL_M)
        ):
            raise ValueError("Expected the 80 m NASA LOLA lunar south polar stereographic DEM")
        profiles = {
            site_id: horizon(raster, sites[site_id])
            for site_id in ("connecting-ridge", "shackleton-rim")
        }
    payload = {
        "source_url": SOURCE_URL,
        "resolution_m": PIXEL_M,
        "range_m": RANGE_M,
        "observer_height_m": OBSERVER_HEIGHT_M,
        "azimuth_step_deg": AZIMUTH_STEP_DEG,
        "sites": profiles,
    }
    output = DATA_DIR / "terrain.json"
    output.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Saved {len(profiles)} terrain profiles to {output}")


if __name__ == "__main__":
    main()

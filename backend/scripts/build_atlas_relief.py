"""Generate the atlas hillshade and height grid from LDEM_60S_240MPP_ADJ.TIF."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

HALF_SPAN_M = 264_000
TEXTURE_SIZE = 2_200
GRID_SIZE = 145
MEDIA = Path(__file__).resolve().parents[2] / "frontend" / "public" / "media"


def build_atlas(dem: Path):
    with rasterio.open(dem) as source:
        cut = from_bounds(-HALF_SPAN_M, -HALF_SPAN_M, HALF_SPAN_M, HALF_SPAN_M, source.transform)
        dem = source.read(
            1, window=cut, out_shape=(TEXTURE_SIZE, TEXTURE_SIZE), resampling=Resampling.bilinear
        )
        if not np.isfinite(dem).all():
            raise ValueError("The selected area contains missing elevation data")
        # A broad fill light keeps crater floors legible at low viewing angles.
        south, east = np.gradient(dem, 2 * HALF_SPAN_M / TEXTURE_SIZE)
        normal = np.sqrt(1 + south**2 + east**2)
        primary = np.clip((0.62 + south * 0.43 - east * 0.65) / normal, 0, 1)
        fill = np.clip((0.85 - south * 0.43 + east * 0.29) / normal, 0, 1)
        shade = np.clip(49 + 159 * primary + 28 * fill, 0, 255).astype(np.uint8)
        indices = np.rint(np.linspace(0, TEXTURE_SIZE - 1, GRID_SIZE)).astype(int)
        heights = np.rint(dem[np.ix_(indices, indices)]).astype(int)
    header = f"P6\n{TEXTURE_SIZE} {TEXTURE_SIZE}\n255\n".encode()
    pixels = np.repeat(shade[:, :, None], 3, axis=2).tobytes()
    subprocess.run(
        ["cwebp", "-quiet", "-q", "89", "-o", str(MEDIA / "lola-pole.webp"), "--", "-"],
        input=header + pixels,
        check=True,
    )
    (MEDIA / "lola-relief.json").write_text(
        json.dumps(
            {
                "halfSpanM": HALF_SPAN_M,
                "size": GRID_SIZE,
                "heights": heights.ravel().tolist(),
            },
            separators=(",", ":"),
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dem", type=Path)
    build_atlas(parser.parse_args().dem)

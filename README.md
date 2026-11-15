# MoonSight

MoonSight compares Sun and Earth visibility at 14 lunar south-pole sites and ranks 6.5-day windows. [Open MoonSight](https://nasa.blizzard.guru/) or [try the terrain example](https://nasa.blizzard.guru/workspace?preset=terrain-impact). Built for the [NASA Space Apps Lunar Landing Site Navigator challenge](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

## Run locally

Install Python 3.12 and [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from the repository root.

```sh
cd backend
uv sync --locked --python 3.12
uv run --locked uvicorn lunawindow.api:app --port 8000
```

Open [interactive API documentation](http://127.0.0.1:8000/docs). Once dependencies are installed, startup and comparisons work offline. The bundled catalog covers 14 reference points from NASA’s Lunar Surface Data Book from **2027-01-01 through 2027-04-01 UTC** at a 30-minute sample cadence.

## Frontend integration

| Method | Route | Response |
| --- | --- | --- |
| GET | `/api/v1/health` | Dataset readiness and version |
| GET | `/api/v1/sites` | Site IDs, coordinates, available date ranges, and source metadata |
| POST | `/api/v1/compare` | Two results in request order, each with positions, windows, and summary metrics |
| GET | `/openapi.json` | OpenAPI schema |

Each scenario can use a different time range. Supply ISO 8601 timestamps with an explicit offset. A scenario must span more than zero and at most 30 days. The API returns UTC timestamps and a `422` response with field details for invalid scenarios.

Use `supported_horizons` from the catalog to offer a geometric or terrain horizon for each site. Use `custom_coordinates_supported` to show the coordinate form when SPICE is enabled. Each result labels its ephemeris and includes the horizon elevation in degrees for both bodies at each sample.

```sh
curl -fsS http://127.0.0.1:8000/api/v1/compare \
  -H 'Content-Type: application/json' \
  -d '{
    "scenarios": [
      {"site_id":"connecting-ridge","start_utc":"2027-01-07T00:00:00Z","end_utc":"2027-01-14T00:00:00Z"},
      {"site_id":"malapert-massif","start_utc":"2027-01-07T00:00:00Z","end_utc":"2027-01-14T00:00:00Z"}
    ]
  }'
```

In this example, the Sun center is above the geometric horizon for 100% of the interval at Connecting Ridge and 0% at Malapert Massif. The Earth center is above the horizon for 40.76% and 87.54% of the interval, respectively. Use `LUNAWINDOW_CORS_ORIGINS` with a comma-separated list of exact frontend origins when serving the UI from a different origin.

## Method and NASA sources

Azimuth runs clockwise from north. The dataset stores apparent, airless azimuth and elevation for the Sun center (10) and Earth center (399), observed from each catalog point in the Moon's MEAN_ME frame. The geometric horizon is 0° relative to the local horizontal plane. Horizons positions use an observer at zero altitude relative to the reference sphere. The API clips calculations to the requested times and estimates visibility-window boundaries by linear interpolation between 30-minute samples. By default, windows use center-of-disk visibility. The optional `visibility` values `disk_any` and `disk_full` use nominal angular radii of 0.2666° for the Sun and 0.95° for Earth. The terrain altitude is taken at the center azimuth, so these modes approximate disk edges. The model estimates the availability of sunlight and a potential direct line of sight to Earth.

The authoritative ephemeris is NASA/JPL Horizons DE441. Site coordinates come from Table A2.1-1 of the NASA Lunar Surface Data Book. The catalog is a set of representative points with east-positive longitudes. [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) · [NASA Lunar Surface Data Book](https://ntrs.nasa.gov/api/citations/20250002845/downloads/M2M-30044%20Lunar%20Surface%20Data%20Book%20Baseline_Final.pdf)

To rebuild from Horizons, run the importer from `backend/` using a new scratch directory for each requested period. It fetches tables one at a time and validates the observer, body, reference frame, and every timestamp before replacing the bundled dataset.

```sh
uv run --locked python -m scripts.import_horizons \
  --raw-dir /tmp/lunawindow-horizons-2027-q1 \
  --contact https://github.com/MironNikanchuk/nasaspace2026/issues
```

### Terrain mode

Set `"horizon": "terrain"` for any catalog site, including Malapert Massif. Custom coordinates use the geometric horizon. The bundled profiles use an 80 m LOLA DEM, a local observer 2 m above the raster surface, a 45 km search radius, and 0.5° azimuth spacing. The ray elevation calculation includes lunar curvature. The terrain comparisons use the same Horizons angles as geometric mode, approximating the small parallax difference between the reference-sphere and local terrain observer. Terrain beyond the search radius and features finer than the DEM resolution can affect actual visibility.

Terrain calculations split each ephemeris interval at the azimuth knots of the terrain profile. Clearance is linear within each segment. The API finds crossings on the source grid before clipping them to the requested dates.

For Connecting Ridge on January 7–14, 2027 UTC, the Earth center is above the geometric horizon for **40.76%** of the interval and above the modeled terrain horizon for **28.31%**. [NASA LOLA DEM](https://pgda.gsfc.nasa.gov/products/90)

To regenerate the profiles, download [LDEM_80S_80MPP_ADJ.TIF](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF). Then run from `backend/`.

```sh
uv run --locked --group terrain python -m scripts.build_terrain /path/to/LDEM_80S_80MPP_ADJ.TIF
```

### Custom coordinates

When SPICE is enabled, replace `site_id` in a scenario with `"coordinates": {"latitude_deg": -89.4632, "longitude_east_deg": 222.51}`. Latitude must be greater than −90° and at most −80°. Longitude uses east-positive degrees in `[0, 360)`. Custom scenarios use the geometric horizon and the same date coverage and 30-day limit as catalog scenarios. The API uses the NAIF SPICE Moon mean-Earth frame with local DE440 kernels and converged light-time and stellar aberration corrections.

Place these five files into `backend/data/kernels/`. [NAIF Generic Kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/)

- `lsk/naif0012.tls`
- `pck/pck00011.tpc`
- `fk/satellites/moon_de440_250416.tf`
- `pck/moon_pa_de440_200625.bpc`
- `spk/planets/de440s.bsp`

```sh
LUNAWINDOW_SPICE_KERNEL_DIR="$PWD/data/kernels" \
  uv run --locked --group spice uvicorn lunawindow.api:app --port 8000
```

The loader also accepts these filenames directly in the kernel directory. To run the SPICE integration test, use the same environment variable with `uv run --locked --group spice python -m pytest -q`.

## Google Cloud Run

Google Cloud is an optional hosting path through the [NASA Space Apps Global Offers](https://www.spaceappschallenge.org/2026/global-offers). Use a team-owned Google Cloud project after confirming the offer and project billing settings. The container listens on Cloud Run's `PORT` and includes the local dataset.

From `backend/`, with `gcloud` authenticated and the Cloud Run, Cloud Build, and Artifact Registry APIs available:

```sh
gcloud run deploy lunawindow-api \
  --source . \
  --project YOUR_PROJECT_ID \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2
```

After deployment, verify `/api/v1/health`, `/docs`, and the comparison example using the service URL. The Cloud Run image contains the catalog ephemerides and terrain profiles. Custom coordinates require the optional local SPICE setup. If the UI uses a separate origin, configure `LUNAWINDOW_CORS_ORIGINS` on the service. [Google Cloud FastAPI guide](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-python-fastapi-service)

## Submission handoff

Use the same real comparison in the project description and public demo. Describe the model and cite the NASA sources above. Disclose Codex assistance in the submission form. Open the demo and final project links in a private browser window before submitting. The organizer's guidance calls for a demo video of up to 30 seconds or up to seven slides. The global submission closes **November 15 at 23:59 local time**. [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) · [Organizer guidance](https://github.com/nasa/spaceapps/discussions/1973) · [2026 timeline](https://www.spaceappschallenge.org/2026/)

## Checks

```sh
cd backend
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked python -m pytest -q
```

## Full-stack web app

The Next.js app lives in `frontend/`. It includes a GameOver landing page, side-by-side comparisons, synchronized elevation plots, visibility timelines, shareable scenarios, CSV export, and a printable report. The [NASA Moon](https://solarsystem.nasa.gov/gltf_embed/2366/) globe lets users select a south-pole landing site and assign it to a comparison. The horizon uses the selected UTC sample and the [NASA Earth](https://solarsystem.nasa.gov/gltf_embed/2393/) model to show why a body is visible or occluded. Anyone can use the analyzer and save scenarios locally in their browser.

With FastAPI running as described above, start the frontend:

```sh
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`. If FastAPI is unreachable, the browser calculates comparisons for any supported date range in Q1 2027 UTC using assets served by the frontend. Catalog sites use bundled JPL Horizons samples and the same terrain windows. Custom coordinates use the geometric horizon and bundled Moon-fixed DE440 vectors with observer parallax; light-time and aberration corrections are evaluated at the lunar center rather than at each site. This fallback requires the frontend to be reachable. The [terrain-impact preset](http://localhost:3000/workspace?preset=terrain-impact) gives a reproducible demo.

### Vercel and Cloudflare setup

1. Start FastAPI on the backend host, then expose it through a [named Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/). Route a stable hostname to `http://127.0.0.1:8000`, and verify `/api/v1/health` through the tunnel. A [Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) is suitable for a temporary rehearsal while the backend and connector are running.
2. In Vercel select the Next.js framework and the `frontend` root. Use `npm run build` to run the project's Webpack build. Set `LUNAWINDOW_API_URL` to the Cloudflare hostname.
3. Verify a comparison for a date outside the preset, including a custom location with FastAPI stopped, and save a scenario in the browser.

Native NASA models are included with web-sized textures. Site markers use east-positive lunar coordinates. The horizon renders the angle profile sampled from LOLA and uses apparent body directions from the API. Body sizes and distances in the scene are illustrative. After changing the ephemerides, terrain, or calculation code, run `uv run --locked python -m scripts.sync_frontend_data` from `backend/` to regenerate both frontend datasets. CI checks that the generated files match the backend.

Images are from [NASA SVS 5605](https://svs.gsfc.nasa.gov/5605/) and [NASA SVS 5228](https://svs.gsfc.nasa.gov/5228/). Icons are from [css.gg](https://iconify.design/icon-sets/gg/) (MIT) via Iconify. Instrument Sans and Instrument Serif are distributed under the SIL Open Font License. The visual polish used [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky.

The landing uses the project’s supplied starfield. The horizon uses [NASA SVS Deep Star Maps](https://svs.gsfc.nasa.gov/4851/) as an illustrative background. Drag the globe to rotate. In the atlas, switch between the 2D map and 3D relief of the south pole. Drag the 2D map to pan or Shift-drag in 3D, and use the atlas zoom controls. The horizon uses a fixed observer. Dragging changes the direction of view. The animated Connecting Ridge example uses Earth elevations and local horizon angles from the saved NASA dataset. Its ridge outline illustrates the obstruction.

The atlas uses the [240 m LOLA polar elevation map](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF) to render a continuous 528 × 528 km hillshade and mesh. The view exaggerates elevation 4× for readability. To regenerate the assets, install `cwebp`, then run from `backend/`: `uv run --locked --group terrain python -m scripts.build_atlas_relief /path/to/LDEM_60S_240MPP_ADJ.TIF`.

The language picker and scene controls use Google's [Material Symbols Rounded](https://github.com/google/material-design-icons) (Apache 2.0).

The Compare overview uses [NASA/SDO imagery of the Sun](https://svs.gsfc.nasa.gov/14709/) and renders its 2D Earth portrait from the same [NASA Earth model](https://solarsystem.nasa.gov/gltf_embed/2393/) as the 3D view. The three bodies are arranged to show clearance above or below the selected site's horizon. Their sizes and distances are illustrative.

### Browser calculations and window search

When the API is unavailable, the browser loads the published ephemerides and computes results for any catalog site and date range supported by the quarter. The site files include visibility intervals calculated on the same source grid as the API. The browser clips those intervals to the requested dates and computes totals, overlap and outages. Custom coordinates require the live SPICE provider.

The window search ranks 6.5-day intervals by the longest uninterrupted Sun window, then by the time with both bodies visible, then by Earth visibility. The heatmap shows the results for windows starting at daily UTC boundaries. The three ranked windows also consider changes at visibility boundaries.

The Method section reports the maximum difference between JPL Horizons DE441 and local NAIF SPICE DE440 elevations across the full catalog and quarter. Regenerate it from `backend/` with `uv run --locked --group spice python -m scripts.validate_ephemerides data/kernels`.

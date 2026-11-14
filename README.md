# MoonSight

MoonSight is a FastAPI backend for comparing Sun and Earth visibility from lunar south-pole sites for the [NASA Space Apps Lunar Landing Site Navigator challenge](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

## Run locally

Install Python 3.12 and [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from the repository root.

```sh
cd backend
uv sync --locked --python 3.12
uv run --locked uvicorn lunawindow.api:app --port 8000
```

Open [interactive API documentation](http://127.0.0.1:8000/docs). Once dependencies are installed, startup and comparisons work offline. The bundled catalog covers Connecting Ridge, Shackleton Rim, and Malapert Massif from **2027-01-01 through 2027-04-01 UTC** at a 30-minute sample cadence.

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

In this example, the Sun center is above the geometric horizon for 100% of the interval at Connecting Ridge and 0% at Malapert Massif. The Earth center is above the horizon for 40.760% and 87.541% of the interval, respectively. Use `LUNAWINDOW_CORS_ORIGINS` with a comma-separated list of exact frontend origins when serving the UI from a different origin.

## Method and NASA sources

Azimuth runs clockwise from north. The dataset stores apparent, airless azimuth and elevation for the Sun center (10) and Earth center (399), observed from each catalog point in the Moon's MEAN_ME frame. The geometric horizon is 0° relative to the local horizontal plane. Horizons positions use an observer at zero altitude relative to the reference sphere. The API clips calculations to the requested times and estimates visibility-window boundaries by linear interpolation between 30-minute samples. Windows describe center-of-disk visibility. The model estimates the availability of sunlight and a potential direct line of sight to Earth.

The authoritative ephemeris is NASA/JPL Horizons DE441. Site coordinates come from Table A2.1-1 of the NASA Lunar Surface Data Book. The catalog is a set of representative points with east-positive longitudes. [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) · [NASA Lunar Surface Data Book](https://ntrs.nasa.gov/api/citations/20250002845/downloads/M2M-30044%20Lunar%20Surface%20Data%20Book%20Baseline_Final.pdf)

To rebuild from Horizons, run the importer from `backend/` using a new scratch directory for each requested period. It fetches tables one at a time and validates the observer, body, reference frame, and every timestamp before replacing the bundled dataset.

```sh
uv run --locked python -m scripts.import_horizons \
  --raw-dir /tmp/lunawindow-horizons-2027-q1 \
  --contact https://github.com/MironNikanchuk/nasaspace2026/issues
```

### Terrain mode

Set `"horizon": "terrain"` on a Connecting Ridge or Shackleton Rim scenario. The bundled profiles use an 80 m LOLA DEM, a local observer 2 m above the raster surface, a 45 km search radius, and 0.5° azimuth spacing. The ray elevation calculation includes lunar curvature. The terrain comparisons use the same Horizons angles as geometric mode, approximating the small parallax difference between the reference-sphere and local terrain observer. Terrain beyond the search radius and features finer than the DEM resolution can affect actual visibility.

For Connecting Ridge on January 7–14, 2027 UTC, the Earth center is above the geometric horizon for **40.760%** of the interval and above the modeled terrain horizon for **28.305%**. [NASA LOLA DEM](https://pgda.gsfc.nasa.gov/products/90)

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

To run the SPICE integration test, use the same environment variable with `uv run --locked --group spice python -m pytest -q`.

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

The Next.js app lives in `frontend/`. It includes a GameOver landing page, side-by-side comparisons, synchronized elevation plots, visibility timelines, shareable scenarios, CSV export, and a printable report. The [NASA Moon](https://solarsystem.nasa.gov/gltf_embed/2366/) globe lets users select a south-pole landing site and assign it to a comparison. The horizon uses the selected UTC sample and the [NASA Earth](https://solarsystem.nasa.gov/gltf_embed/2393/) model to show why a body is visible or occluded. The analyzer is public. Guests can save scenarios in their browser. Signed-in users use a private Supabase library.

With FastAPI running as described above, start the frontend:

```sh
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`. When FastAPI is unreachable, the app serves bundled real results for January 7–14, 2027 UTC. Live date changes and custom coordinates require the running API. The [terrain-impact preset](http://localhost:3000/workspace?preset=terrain-impact) gives a reproducible demo.

### Vercel, Cloudflare and Supabase setup

1. Start FastAPI on the backend host, then expose it through a [named Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/). Route a stable hostname to `http://127.0.0.1:8000`, and verify `/api/v1/health` through the tunnel. A [Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) is suitable for a temporary rehearsal while the backend and connector are running.
2. In the team’s Supabase project, apply `supabase/migrations/202611140001_saved_scenarios.sql`. It limits database access to each account’s own rows. Set the production site URL and allow the app’s `/account` page in Auth redirect URLs. Configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) for email confirmation outside the Supabase team. The Google sign-in button appears when the [Google provider](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) is enabled.
3. In Vercel select the Next.js framework and the `frontend` root. Use `npm run build` to run the project's Webpack build. Set `LUNAWINDOW_API_URL` to the Cloudflare hostname, plus `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Keep database passwords and secret keys in provider settings.
4. Open the production app as a guest and test a date outside the bundled week. Then verify a cloud save using a confirmed account. Check the 3D atlas and test the preset with the API unavailable.

Native NASA models are included with web-sized textures. Site markers use east-positive lunar coordinates. The horizon renders the angle profile sampled from LOLA and uses apparent body directions from the API. Body sizes and distances in the scene are illustrative. After rebuilding the terrain profiles, copy `backend/data/terrain.json` into `frontend/data/terrain.json` to keep the scene and calculations aligned.

Images are from [NASA SVS 5605](https://svs.gsfc.nasa.gov/5605/) and [NASA SVS 5228](https://svs.gsfc.nasa.gov/5228/). Icons are from [css.gg](https://iconify.design/icon-sets/gg/) (MIT) via Iconify. Instrument Sans and Instrument Serif are distributed under the SIL Open Font License. The visual polish used [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky.

The landing uses the project’s supplied starfield. The horizon uses [NASA SVS Deep Star Maps](https://svs.gsfc.nasa.gov/4851/) as an illustrative background. Drag the globe to rotate, Shift-drag or use the atlas Pan tool to move the view, and use the zoom buttons. The horizon uses a fixed observer. Dragging changes the direction of view. The animated Connecting Ridge example uses Earth elevations and local horizon angles from the saved NASA dataset. Its ridge outline illustrates the obstruction.

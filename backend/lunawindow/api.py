from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Literal, Self

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from .ephemeris import HORIZONS_SOURCE, SITE_SOURCE, Dataset, Position, Series, Site
from .spice_provider import SOURCE_URL as SPICE_SOURCE_URL
from .spice_provider import SpiceProvider
from .terrain import TerrainProfile, load_terrain
from .visibility import (
    DiskVisibility,
    Window,
    disk_offset,
    longest_outage,
    simultaneous_windows,
    terrain_windows,
    visible_windows,
)

MAX_DURATION_DAYS = 30


class Coordinates(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude_deg: Annotated[float, Field(gt=-90, le=-80, allow_inf_nan=False)]
    longitude_east_deg: Annotated[float, Field(ge=0, lt=360, allow_inf_nan=False)]


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site_id: Annotated[str | None, Field(min_length=1, max_length=64)] = None
    coordinates: Coordinates | None = None
    start_utc: AwareDatetime
    end_utc: AwareDatetime
    horizon: Literal["geometric", "terrain"] = "geometric"
    visibility: DiskVisibility = "disk_center"

    @field_validator("start_utc", "end_utc", mode="before")
    @classmethod
    def require_iso_datetime(cls, value: object) -> object:
        if not isinstance(value, str) or "T" not in value:
            raise ValueError("Use an ISO 8601 date and time with a UTC offset")
        return value

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if (self.site_id is None) == (self.coordinates is None):
            raise ValueError("Supply exactly one of site_id and coordinates")
        try:
            self.start_utc = self.start_utc.astimezone(UTC)
            self.end_utc = self.end_utc.astimezone(UTC)
        except OverflowError as error:
            raise ValueError("UTC timestamps must be between years 0001 and 9999") from error
        duration = self.end_utc - self.start_utc
        if duration <= timedelta(0):
            raise ValueError("end_utc must follow start_utc")
        if duration > timedelta(days=MAX_DURATION_DAYS):
            raise ValueError(f"Each scenario may cover at most {MAX_DURATION_DAYS} days")
        return self


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenarios: Annotated[list[Scenario], Field(min_length=2, max_length=2)]


class CatalogSite(BaseModel):
    site: Site
    start_utc: datetime
    end_utc: datetime
    supported_horizons: list[Literal["geometric", "terrain"]]


class DatasetInfo(BaseModel):
    version: str
    imported_at_utc: datetime
    horizons_api_version: str
    ephemeris: str
    step_minutes: int
    coordinate_frame: Literal["MEAN_ME"] = "MEAN_ME"
    ephemeris_source_url: str = HORIZONS_SOURCE
    site_source_url: str = SITE_SOURCE


class Catalog(BaseModel):
    sites: list[CatalogSite]
    dataset: DatasetInfo
    max_duration_days: int = MAX_DURATION_DAYS
    custom_coordinates_supported: bool


class GeometricModel(BaseModel):
    horizon: Literal["geometric"] = "geometric"
    horizon_elevation_deg: Literal[0] = 0
    visibility: DiskVisibility = "disk_center"
    crossing_method: Literal["linear_interpolation"] = "linear_interpolation"


class TerrainModel(BaseModel):
    horizon: Literal["terrain"] = "terrain"
    visibility: DiskVisibility = "disk_center"
    crossing_method: Literal["piecewise_terrain_interpolation"] = "piecewise_terrain_interpolation"
    source_url: str
    resolution_m: int
    range_m: int
    observer_height_m: float
    observer_altitude_m: float
    azimuth_step_deg: float


class PositionAtHorizon(BaseModel):
    azimuth_deg: float
    elevation_deg: float
    horizon_elevation_deg: float
    above_horizon: bool

    @classmethod
    def at(
        cls, position: Position, terrain: TerrainProfile | None, offset: float = 0.0
    ) -> PositionAtHorizon:
        horizon = terrain.horizon_at(position.azimuth_deg) if terrain else 0.0
        return cls(
            azimuth_deg=position.azimuth_deg,
            elevation_deg=position.elevation_deg,
            horizon_elevation_deg=horizon,
            above_horizon=position.elevation_deg + offset > horizon,
        )


class SampleResult(BaseModel):
    time_utc: datetime
    sun: PositionAtHorizon
    earth: PositionAtHorizon


class Summary(BaseModel):
    sun_visible_percent: float
    earth_visible_percent: float
    both_visible_percent: float
    longest_sun_window_hours: float
    longest_sun_outage_hours: float
    longest_earth_outage_hours: float


class Windows(BaseModel):
    sun: list[Window]
    earth: list[Window]
    both: list[Window]


class ScenarioResult(BaseModel):
    site: Site
    start_utc: datetime
    end_utc: datetime
    model: Annotated[GeometricModel | TerrainModel, Field(discriminator="horizon")]
    ephemeris: Literal["JPL Horizons DE441", "NAIF SPICE DE440"]
    ephemeris_source_url: str
    summary: Summary
    windows: Windows
    samples: list[SampleResult]


class CompareResponse(BaseModel):
    dataset: DatasetInfo
    scenarios: list[ScenarioResult]


class Health(BaseModel):
    status: Literal["ready"] = "ready"
    dataset_version: str
    site_count: int


def dataset_info(dataset: Dataset) -> DatasetInfo:
    return DatasetInfo(
        version=dataset.version,
        imported_at_utc=dataset.imported_at_utc,
        horizons_api_version=dataset.horizons_api_version,
        ephemeris=dataset.ephemeris,
        step_minutes=int(next(iter(dataset.series.values())).step.total_seconds() / 60),
    )


def evaluate(
    site: Site,
    series: Series,
    scenario: Scenario,
    terrain: TerrainProfile | None,
    *,
    custom: bool = False,
) -> ScenarioResult:
    sun_offset, earth_offset = (
        disk_offset(scenario.visibility, 0),
        disk_offset(scenario.visibility, 1),
    )
    samples = [
        SampleResult(
            time_utc=sample.time_utc,
            sun=PositionAtHorizon.at(sample.sun, terrain, sun_offset),
            earth=PositionAtHorizon.at(sample.earth, terrain, earth_offset),
        )
        for sample in series.samples_between(scenario.start_utc, scenario.end_utc)
    ]
    interval = Window(scenario.start_utc, scenario.end_utc)
    if terrain:
        sun = terrain_windows(series, interval, terrain, 0, sun_offset)
        earth = terrain_windows(series, interval, terrain, 1, earth_offset)
    else:
        times = [sample.time_utc for sample in samples]
        sun = visible_windows(times, [sample.sun.elevation_deg + sun_offset for sample in samples])
        earth = visible_windows(
            times, [sample.earth.elevation_deg + earth_offset for sample in samples]
        )
    both = simultaneous_windows(sun, earth)

    def percent(windows: list[Window]) -> float:
        total = sum(window.duration_seconds for window in windows)
        return round(100 * (total / interval.duration_seconds), 3)

    return ScenarioResult(
        site=site,
        start_utc=scenario.start_utc,
        end_utc=scenario.end_utc,
        model=(
            TerrainModel.model_validate(terrain, from_attributes=True).model_copy(
                update={"visibility": scenario.visibility}
            )
            if terrain
            else GeometricModel(visibility=scenario.visibility)
        ),
        ephemeris="NAIF SPICE DE440" if custom else "JPL Horizons DE441",
        ephemeris_source_url=SPICE_SOURCE_URL if custom else HORIZONS_SOURCE,
        samples=samples,
        windows=Windows(sun=sun, earth=earth, both=both),
        summary=Summary(
            sun_visible_percent=percent(sun),
            earth_visible_percent=percent(earth),
            both_visible_percent=percent(both),
            longest_sun_window_hours=round(
                max((w.duration_seconds for w in sun), default=0) / 3600, 3
            ),
            longest_sun_outage_hours=round(longest_outage(sun, interval) / 3600, 3),
            longest_earth_outage_hours=round(longest_outage(earth, interval) / 3600, 3),
        ),
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.dataset = Dataset.load()
    app.state.terrain = load_terrain()
    kernel_directory = os.environ.get("LUNAWINDOW_SPICE_KERNEL_DIR")
    app.state.spice = SpiceProvider(Path(kernel_directory)) if kernel_directory else None
    yield


app = FastAPI(
    title="MoonSight",
    version="1.0.0",
    description="Compare Sun and Earth visibility windows from lunar south-pole sites.",
    lifespan=lifespan,
)
origins = [origin.strip() for origin in os.environ.get("LUNAWINDOW_CORS_ORIGINS", "").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in origins if origin],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, error: RequestValidationError) -> JSONResponse:
    detail = [{key: issue[key] for key in ("loc", "msg", "type")} for issue in error.errors()]
    return JSONResponse(status_code=422, content={"detail": detail})


@app.get("/api/v1/health")
def health(request: Request) -> Health:
    dataset: Dataset = request.app.state.dataset
    return Health(dataset_version=dataset.version, site_count=len(dataset.sites))


@app.get("/api/v1/sites")
def sites(request: Request) -> Catalog:
    dataset: Dataset = request.app.state.dataset
    terrain: dict[str, TerrainProfile] = request.app.state.terrain
    return Catalog(
        sites=[
            CatalogSite(
                site=site,
                start_utc=dataset.series[site.id].start_utc,
                end_utc=dataset.series[site.id].end_utc,
                supported_horizons=["geometric", "terrain"]
                if site.id in terrain
                else ["geometric"],
            )
            for site in dataset.sites.values()
        ],
        dataset=dataset_info(dataset),
        custom_coordinates_supported=request.app.state.spice is not None,
    )


@app.post("/api/v1/compare")
def compare(request: Request, payload: CompareRequest) -> CompareResponse:
    dataset: Dataset = request.app.state.dataset
    terrain: dict[str, TerrainProfile] = request.app.state.terrain
    spice: SpiceProvider | None = request.app.state.spice
    reference = next(iter(dataset.series.values()))
    errors = []
    observers: list[Site] = []
    for index, scenario in enumerate(payload.scenarios):
        loc = ["body", "scenarios", index]
        if scenario.coordinates is not None:
            observer = Site(
                "custom",
                "Custom coordinates",
                scenario.coordinates.latitude_deg,
                scenario.coordinates.longitude_east_deg,
                0,
                None,
            )
            if spice is None:
                errors.append(
                    {
                        "loc": [*loc, "coordinates"],
                        "msg": "The SPICE provider is disabled on this server",
                        "type": "custom_coordinates_unavailable",
                    }
                )
                continue
        else:
            observer = dataset.sites.get(scenario.site_id)
        if observer is None:
            errors.append(
                {"loc": [*loc, "site_id"], "msg": "Unknown site ID", "type": "unknown_site"}
            )
            continue

        observers.append(observer)
        series = dataset.series.get(observer.id, reference)
        if not series.start_utc <= scenario.start_utc < scenario.end_utc <= series.end_utc:
            errors.append(
                {
                    "loc": loc,
                    "msg": "Scenario dates are outside the site's available coverage",
                    "type": "outside_coverage",
                }
            )
        elif scenario.horizon == "terrain" and observer.id not in terrain:
            errors.append(
                {
                    "loc": [*loc, "horizon"],
                    "msg": "Terrain is unavailable for this site",
                    "type": "terrain_unavailable",
                }
            )
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    results = []
    for scenario, observer in zip(payload.scenarios, observers, strict=True):
        custom = scenario.coordinates is not None
        if custom and spice is not None:
            series = spice.series(observer, scenario.start_utc, scenario.end_utc, reference.step)
        else:
            series = dataset.series[observer.id]
        profile = terrain.get(observer.id) if scenario.horizon == "terrain" else None
        results.append(evaluate(observer, series, scenario, profile, custom=custom))

    return CompareResponse(
        dataset=dataset_info(dataset),
        scenarios=results,
    )
